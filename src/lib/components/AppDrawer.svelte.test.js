import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AppDrawer from './AppDrawer.svelte';

const device = { dongle_id: 'aaaaaaaaaaaaaaaa', alias: 'Bronco Sport', is_owner: true, last_athena_ping: 0 };

function mount(props = {}) {
  return render(AppDrawer, {
    devices: [device],
    device: null,
    profile: null,
    selectedDongleId: device.dongle_id,
    onclose: vi.fn(),
    onselect: vi.fn(),
    onsettings: vi.fn(),
    ...props,
  });
}

const drawer = (container) => container.querySelector('aside');
const scrim = (container) => container.querySelector('.bg-black\\/50');

describe('AppDrawer', () => {
  it('carries the device list', () => {
    mount();
    expect(screen.getByText('Bronco Sport')).toBeInTheDocument();
  });

  describe('as a permanent drawer, which is part of the layout', () => {
    it('is on screen with no scrim over the page', () => {
      const { container } = mount({ isPermanent: true, open: false });
      expect(scrim(container)).toBeNull();
      expect(drawer(container)).toHaveAttribute('aria-hidden', 'false');
    });

    it('does not translate itself out of view', () => {
      const { container } = mount({ isPermanent: true });
      expect(drawer(container).getAttribute('style')).not.toContain('translateX');
    });
  });

  describe('as a temporary drawer, which sits over the page', () => {
    it('is hidden from assistive tech and slid off screen while closed', () => {
      const { container } = mount({ isPermanent: false, open: false });
      expect(drawer(container)).toHaveAttribute('aria-hidden', 'true');
      expect(drawer(container).getAttribute('style')).toContain('translateX(-100%)');
    });

    it('slides in and raises a scrim when opened', () => {
      const { container } = mount({ isPermanent: false, open: true });
      expect(drawer(container)).toHaveAttribute('aria-hidden', 'false');
      expect(drawer(container).getAttribute('style')).toContain('translateX(0)');
      expect(scrim(container)).not.toBeNull();
    });

    it('closes when the scrim is clicked', async () => {
      const onclose = vi.fn();
      const { container } = mount({ isPermanent: false, open: true, onclose });

      await userEvent.click(scrim(container));

      expect(onclose).toHaveBeenCalled();
    });

    it('starts below the header rather than under it', () => {
      const { container } = mount({ isPermanent: false, open: true, headerHeight: 80 });
      expect(drawer(container).getAttribute('style')).toContain('top: 80px');
      expect(scrim(container).getAttribute('style')).toContain('top: 80px');
    });
  });

  it('takes the width it is given', () => {
    const { container } = mount({ width: 320 });
    expect(drawer(container).getAttribute('style')).toContain('width: 320px');
  });
});
