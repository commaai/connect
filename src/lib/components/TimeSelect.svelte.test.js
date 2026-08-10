import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TimeSelect from './TimeSelect.svelte';

/** Local midnight, which is what changeStart/changeEnd build from a date input. */
const day = (y, m, d, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();

function mount(props = {}) {
  return render(TimeSelect, {
    isOpen: true,
    filter: { start: day(2026, 6, 1), end: day(2026, 6, 30, 23, 59, 59) },
    onclose: vi.fn(),
    onselect: vi.fn(),
    ...props,
  });
}

describe('TimeSelect', () => {
  it('renders nothing while closed', () => {
    mount({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with the current filter in the two inputs', () => {
    mount();
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-06-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-06-30');
  });

  it('will not offer an end date before the start', () => {
    mount();
    expect(screen.getByLabelText('End date')).toHaveAttribute('min', '2026-06-01');
  });

  it('caps both inputs at today', () => {
    mount();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(screen.getByLabelText('Start date')).toHaveAttribute('max', iso);
    expect(screen.getByLabelText('End date')).toHaveAttribute('max', iso);
  });

  describe('saving', () => {
    it('hands back the unchanged range when nothing was edited', async () => {
      const onselect = vi.fn();
      const onclose = vi.fn();
      mount({ onselect, onclose });

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onselect).toHaveBeenCalledWith(day(2026, 6, 1), day(2026, 6, 30, 23, 59, 59));
      expect(onclose).toHaveBeenCalled();
    });

    it('takes the start from midnight local and the end from the last second of its day', async () => {
      const onselect = vi.fn();
      mount({ onselect });

      const start = screen.getByLabelText('Start date');
      const end = screen.getByLabelText('End date');
      // a date input reports UTC midnight; the component rebuilds it in local time
      start.valueAsDate = new Date(Date.UTC(2026, 2, 4));
      start.dispatchEvent(new Event('input', { bubbles: true }));
      end.valueAsDate = new Date(Date.UTC(2026, 2, 9));
      end.dispatchEvent(new Event('input', { bubbles: true }));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onselect).toHaveBeenCalledWith(day(2026, 3, 4), day(2026, 3, 9, 23, 59, 59));
    });

    it('ignores an input the browser could not parse into a date', async () => {
      const onselect = vi.fn();
      mount({ onselect });

      const start = screen.getByLabelText('Start date');
      start.valueAsDate = null;
      start.dispatchEvent(new Event('input', { bubbles: true }));

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(onselect).toHaveBeenCalledWith(day(2026, 6, 1), day(2026, 6, 30, 23, 59, 59));
    });
  });

  describe('dismissing', () => {
    it('closes on Cancel without selecting anything', async () => {
      const onselect = vi.fn();
      const onclose = vi.fn();
      mount({ onselect, onclose });

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onclose).toHaveBeenCalled();
      expect(onselect).not.toHaveBeenCalled();
    });

    it('closes on the backdrop', async () => {
      const onclose = vi.fn();
      const { container } = mount({ onclose });

      await userEvent.click(container.querySelector('.bg-black\\/50'));

      expect(onclose).toHaveBeenCalled();
    });

    it('closes on Escape', async () => {
      const onclose = vi.fn();
      mount({ onclose });

      await userEvent.keyboard('{Escape}');

      expect(onclose).toHaveBeenCalled();
    });

    it('does not answer Escape once it is closed', async () => {
      const onclose = vi.fn();
      mount({ isOpen: false, onclose });

      await userEvent.keyboard('{Escape}');

      expect(onclose).not.toHaveBeenCalled();
    });
  });

  describe('the body scroll lock', () => {
    it('holds the page still while open and puts it back on close', () => {
      const { unmount } = mount();
      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('');
    });

    it('leaves the page alone while closed', () => {
      mount({ isOpen: false });
      expect(document.body.style.overflow).toBe('');
    });
  });
});
