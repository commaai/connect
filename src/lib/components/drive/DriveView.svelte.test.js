import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { goto } from '$app/navigation';
import { playback } from '$lib/state/playback.svelte.js';
import DriveView from './DriveView.svelte';

// Neither child is what this covers, and both reach for the network on mount.
vi.mock('$lib/components/Timeline.svelte', () => ({ default: () => {} }));
vi.mock('./Media.svelte', () => ({ default: () => {} }));

const DONGLE = 'aaaaaaaaaaaaaaaa';

const route = {
  fullname: `${DONGLE}|000000dd--455f14369d`,
  log_id: '000000dd--455f14369d',
  duration: 600000,
  start_time_utc_millis: new Date(2026, 5, 5, 9, 0, 0).getTime(),
};

beforeEach(() => {
  playback.reset();
  playback.zoom = null;
});

const mount = (props = {}) => render(DriveView, {
  dongleId: DONGLE,
  route,
  onclose: vi.fn(),
  ...props,
});

/** The header line, whose weekday sits in its own span for the small breakpoint. */
const headerText = (container) => container.querySelector('.text-lg').textContent.trim();

describe('DriveView', () => {
  describe('the header range', () => {
    it('reads out the day, start and end of the drive', () => {
      const { container } = mount();
      // 2026-06-05 is a Friday; a ten minute drive from 09:00
      expect(headerText(container)).toBe('Friday Jun 5 @ 09:00 - 09:10');
    });

    it('dates the end when the drive runs past midnight', () => {
      const { container } = mount({
        route: { ...route, start_time_utc_millis: new Date(2026, 5, 5, 23, 55).getTime() },
      });
      expect(headerText(container)).toBe('Friday Jun 5 @ 23:55 - Jun 6 @ 00:05');
    });

    it('follows the zoom rather than always showing the whole route', () => {
      playback.zoom = { start: 120000, end: 180000, previous: null };
      const { container } = mount();
      expect(headerText(container)).toBe('Friday Jun 5 @ 09:02 - 09:03');
    });
  });

  describe('the back button', () => {
    it('is disabled while the whole route is in view', () => {
      mount();
      expect(screen.getByRole('button', { name: 'Go Back' })).toBeDisabled();
    });

    it('is live once the timeline is zoomed in', () => {
      playback.zoom = { start: 120000, end: 180000, previous: null };
      mount();
      expect(screen.getByRole('button', { name: 'Go Back' })).toBeEnabled();
    });

    it('pops back to the zoom it came from', async () => {
      const whole = { start: 0, end: route.duration, previous: null };
      playback.zoom = { start: 120000, end: 180000, previous: whole };
      mount();

      await userEvent.click(screen.getByRole('button', { name: 'Go Back' }));

      expect(playback.zoom).toEqual(whole);
      expect(goto).toHaveBeenCalledWith(`/${DONGLE}/${route.log_id}`);
    });
  });

  describe('closing', () => {
    it('tells the parent and goes back to the device', async () => {
      // the zoom is dropped too, but the seeding effect puts a whole-route one
      // back on a component the app would have unmounted by now
      playback.zoom = { start: 120000, end: 180000, previous: null };
      const onclose = vi.fn();
      mount({ onclose });

      await userEvent.click(screen.getByRole('link', { name: 'Close' }));

      expect(onclose).toHaveBeenCalled();
      expect(goto).toHaveBeenCalledWith(`/${DONGLE}`);
    });

    it('is a real link, so it can be opened in a new tab', async () => {
      const onclose = vi.fn();
      mount({ onclose });
      const link = screen.getByRole('link', { name: 'Close' });
      expect(link).toHaveAttribute('href', `/${DONGLE}`);

      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
      link.dispatchEvent(ev);

      expect(onclose).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(false);
    });
  });

  it('says so when the route does not exist', () => {
    mount({ routes: [] });
    expect(screen.getByText('Route does not exist.')).toBeInTheDocument();
  });

  it('seeds the zoom and loop for a direct load', () => {
    mount();
    expect(playback.zoom).toEqual({ start: 0, end: route.duration, previous: null });
    expect(playback.loop).toMatchObject({ startTime: 0, duration: route.duration });
  });

  it('takes the zoom from the URL when there is one', () => {
    mount({ initialZoom: { start: 60000, end: 120000, previous: null } });
    expect(playback.zoom).toEqual({ start: 60000, end: 120000, previous: null });
  });
});
