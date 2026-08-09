import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DeviceList from './DeviceList.svelte';

const owned = { dongle_id: 'aaaaaaaaaaaaaaaa', alias: 'Bronco Sport', is_owner: true, last_athena_ping: 0 };
const other = { dongle_id: 'bbbbbbbbbbbbbbbb', alias: 'Body', is_owner: false, last_athena_ping: 0 };

function mount(props = {}) {
  return render(DeviceList, {
    devices: [owned],
    device: null,
    profile: null,
    selectedDongleId: owned.dongle_id,
    onselect: vi.fn(),
    onsettings: vi.fn(),
    onpaired: vi.fn(),
    ...props,
  });
}

describe('DeviceList', () => {
  it('renders nothing until the device list has loaded', () => {
    const { container } = mount({ devices: null });
    expect(container.querySelector('a')).toBeNull();
  });

  it('lists the account devices', () => {
    mount({ devices: [owned, other] });
    expect(screen.getByText('Bronco Sport')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  describe('a shared device is not in the account list', () => {
    it('prepends a placeholder so the sidebar is not empty', () => {
      mount({ devices: [owned], selectedDongleId: 'cccccccccccccccc' });
      expect(screen.getByText('cccccccccccccccc')).toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });

    it('uses the fetched shared device when there is one', () => {
      const shared = { ...other, dongle_id: 'cccccccccccccccc', alias: 'Someone else' };
      mount({ devices: [owned], device: shared, selectedDongleId: shared.dongle_id });
      // emptyDevice's alias wins over the shared device's own
      expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
      expect(screen.getByText('cccccccccccccccc')).toBeInTheDocument();
    });

    it('leaves the list alone when the selected device is in it', () => {
      mount({ devices: [owned, other], selectedDongleId: other.dongle_id });
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
  });

  describe('selecting', () => {
    it('selects on a plain click without letting the browser follow the href', async () => {
      const onselect = vi.fn();
      mount({ devices: [owned, other], onselect });

      const link = screen.getByText('Body').closest('a');
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(ev);

      expect(onselect).toHaveBeenCalledWith(other.dongle_id);
      expect(ev.defaultPrevented).toBe(true);
    });

    it('leaves a modified click to the browser, so it can open a new tab', () => {
      const onselect = vi.fn();
      mount({ devices: [owned, other], onselect });

      const link = screen.getByText('Body').closest('a');
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
      link.dispatchEvent(ev);

      expect(onselect).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(false);
      expect(link).toHaveAttribute('href', `/${other.dongle_id}`);
    });
  });

  describe('the settings button', () => {
    it('is there for a device you own', () => {
      mount({ devices: [owned] });
      expect(screen.getByRole('button', { name: 'device settings' })).toBeInTheDocument();
    });

    it('is hidden for someone else\'s device', () => {
      mount({ devices: [other], selectedDongleId: other.dongle_id });
      expect(screen.queryByRole('button', { name: 'device settings' })).not.toBeInTheDocument();
    });

    it('is there for a superuser regardless', () => {
      mount({ devices: [other], selectedDongleId: other.dongle_id, profile: { superuser: true } });
      expect(screen.getByRole('button', { name: 'device settings' })).toBeInTheDocument();
    });

    it('opens settings without also selecting the device', async () => {
      const onselect = vi.fn();
      const onsettings = vi.fn();
      mount({ devices: [owned], onselect, onsettings });

      await userEvent.click(screen.getByRole('button', { name: 'device settings' }));

      expect(onsettings).toHaveBeenCalledWith(owned.dongle_id);
      expect(onselect).not.toHaveBeenCalled();
    });
  });
});
