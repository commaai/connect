import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DriveList from './DriveList.svelte';

const { fetchDeviceStats } = vi.hoisted(() => ({ fetchDeviceStats: vi.fn() }));
vi.mock('$lib/api', () => ({
  devices: { fetchDeviceStats },
  USERADMIN_URL_ROOT: 'https://useradmin.example/',
}));

// DriveListItem pulls per-route data over the network on mount; the list's own
// behaviour is what is under test here.
vi.mock('$lib/state/routes.svelte.js', () => ({
  getRouteEvents: () => undefined,
  getRouteLocations: () => undefined,
  getRouteVideoStartOffset: () => null,
  getRouteDriveCoords: () => undefined,
  fetchEvents: vi.fn(),
  fetchLocations: vi.fn(),
  fetchDriveCoords: vi.fn(),
}));

const { isMetric } = vi.hoisted(() => ({ isMetric: vi.fn(() => false) }));
vi.mock('$lib/utils/conversions', async (importOriginal) => ({
  ...(await importOriginal()),
  isMetric,
}));

const stats = { all: { distance: 1000, routes: 42, minutes: 600 } };

const drive = (n, startMillis) => ({
  fullname: `aaaaaaaaaaaaaaaa|${n}`,
  dongle_id: 'aaaaaaaaaaaaaaaa',
  log_id: String(n),
  start_time_utc_millis: startMillis,
  end_time_utc_millis: startMillis + 600000,
  duration: 600000,
  distance: 5,
});

let observed = [];

const JUN_1 = new Date(2026, 5, 1, 9, 0).getTime();
const DAY = 86400000;

beforeEach(() => {
  isMetric.mockReturnValue(false);
  fetchDeviceStats.mockResolvedValue(stats);
  observed = [];
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }

    observe(node) { observed.push({ node, fire: () => this.callback([{ target: node, isIntersecting: true }]) }); }

    unobserve() {}

    disconnect() {}
  };
});

function mount(props = {}) {
  return render(DriveList, {
    dongleId: 'aaaaaaaaaaaaaaaa',
    device: { dongle_id: 'aaaaaaaaaaaaaaaa', shared: false },
    routes: [],
    lastRoutes: null,
    onfilter: vi.fn(),
    onrefresh: vi.fn(),
    onloadmore: vi.fn(),
    ...props,
  });
}

describe('DriveList', () => {
  describe('the device stats banner', () => {
    it('is absent until the stats arrive', () => {
      fetchDeviceStats.mockReturnValue(new Promise(() => {}));
      mount();
      expect(screen.queryByText('drives')).not.toBeInTheDocument();
    });

    it('reports distance, drives and hours once they have', async () => {
      mount();
      expect(await screen.findByText('miles')).toBeInTheDocument();
      expect(screen.getByText('1000')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument(); // 600 minutes
    });

    it('converts the distance for a metric account', async () => {
      isMetric.mockReturnValue(true);
      mount();
      expect(await screen.findByText('kilometers')).toBeInTheDocument();
      expect(screen.getByText('1609')).toBeInTheDocument();
    });

    it('is not fetched at all for a device shared with you', async () => {
      mount({ device: { dongle_id: 'aaaaaaaaaaaaaaaa', shared: true } });
      await waitFor(() => expect(screen.queryByText('drives')).not.toBeInTheDocument());
      expect(fetchDeviceStats).not.toHaveBeenCalled();
    });

    it('leaves the rest of the list usable when the stats request fails', async () => {
      fetchDeviceStats.mockRejectedValue(new Error('nope'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mount();
      expect(await screen.findByRole('button', { name: /Filter/ })).toBeInTheDocument();
      expect(screen.queryByText('drives')).not.toBeInTheDocument();
    });

    it('refetches when the device changes', async () => {
      const { rerender } = mount();
      await screen.findByText('miles');
      expect(fetchDeviceStats).toHaveBeenCalledTimes(1);

      await rerender({ dongleId: 'bbbbbbbbbbbbbbbb' });

      await waitFor(() => expect(fetchDeviceStats).toHaveBeenCalledTimes(2));
      expect(fetchDeviceStats).toHaveBeenLastCalledWith('bbbbbbbbbbbbbbbb');
    });
  });

  describe('the drive entries', () => {
    it('puts the newest drive first whatever order the API returned', () => {
      const routes = [drive(1, JUN_1), drive(3, JUN_1 + (2 * DAY)), drive(2, JUN_1 + DAY)];
      mount({ routes });

      const links = screen.getAllByRole('link');
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/aaaaaaaaaaaaaaaa/3',
        '/aaaaaaaaaaaaaaaa/2',
        '/aaaaaaaaaaaaaaaa/1',
      ]);
    });

    it('keeps showing the previous page while the next one is being fetched', () => {
      mount({ routes: null, lastRoutes: [drive(1, JUN_1)] });
      expect(screen.getByRole('link')).toHaveAttribute('href', '/aaaaaaaaaaaaaaaa/1');
    });

    it('says it is loading for a device whose routes have not arrived', () => {
      mount({ routes: null, lastRoutes: null });
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('says the range is empty when the fetch came back with nothing', () => {
      mount({ routes: [] });
      expect(screen.getByText('No routes found in selected time range.')).toBeInTheDocument();
    });

    it('offers the end-of-list note only past the fifth drive', () => {
      const routes = Array.from({ length: 6 }, (_, i) => drive(i, JUN_1 + (i * DAY)));
      mount({ routes });
      expect(screen.getByText('There are no more routes found in selected time range.')).toBeInTheDocument();
    });

    it('does not offer it for a short list', () => {
      mount({ routes: [drive(1, JUN_1)] });
      expect(screen.queryByText(/no more routes/)).not.toBeInTheDocument();
    });
  });

  describe('coming back to the page', () => {
    // jsdom reports hasFocus() false for everything, so focus is modelled here.
    const setFocused = (focused) => vi.spyOn(document, 'hasFocus').mockReturnValue(focused);

    // Anchored at call time, not at module load: under a full run the component
    // mounts seconds after this file is imported, and the throttle counts from
    // the mount.
    const secondsLater = (s) => {
      const then = Date.now() + (s * 1000);
      vi.spyOn(Date, 'now').mockReturnValue(then);
    };

    const leave = async () => {
      setFocused(false);
      window.dispatchEvent(new Event('blur'));
      await tick();
    };
    /** The window regaining focus is the signal a document-level listener misses. */
    const comeBack = async () => {
      setFocused(true);
      window.dispatchEvent(new Event('focus'));
      await tick();
    };

    const mountFocused = async (props) => {
      setFocused(true);
      const result = mount(props);
      await screen.findByText('miles');
      fetchDeviceStats.mockClear();
      return result;
    };

    it('refreshes the drives and the stats', async () => {
      const onrefresh = vi.fn();
      await mountFocused({ onrefresh });

      // the throttle is a minute; come back after one
      await leave();
      secondsLater(61);
      await comeBack();

      expect(onrefresh).toHaveBeenCalled();
      await waitFor(() => expect(fetchDeviceStats).toHaveBeenCalled());
    });

    it('does nothing for a glance away and straight back', async () => {
      const onrefresh = vi.fn();
      await mountFocused({ onrefresh });

      await leave();
      await comeBack();

      expect(onrefresh).not.toHaveBeenCalled();
      expect(fetchDeviceStats).not.toHaveBeenCalled();
    });

    it('does nothing on the way out', async () => {
      const onrefresh = vi.fn();
      await mountFocused({ onrefresh });

      secondsLater(61);
      await leave();

      expect(onrefresh).not.toHaveBeenCalled();
    });

    it('refreshes when the tab is switched back to as well', async () => {
      const onrefresh = vi.fn();
      await mountFocused({ onrefresh });

      secondsLater(61);
      setFocused(true);
      document.dispatchEvent(new Event('visibilitychange'));
      await tick();

      expect(onrefresh).toHaveBeenCalled();
    });
  });

  describe('paging in the next drives', () => {
    const routes = Array.from({ length: 3 }, (_, i) => drive(i, JUN_1 + (i * DAY)));

    it('watches only the last entry', () => {
      mount({ routes });

      expect(observed).toHaveLength(1);
      // newest first, so the last rendered entry is the oldest drive
      expect(observed[0].node.getAttribute('href')).toBe('/aaaaaaaaaaaaaaaa/0');
    });

    it('watches the entry itself rather than a box wrapped around it', () => {
      const { container } = mount({ routes });

      expect(observed[0].node.tagName).toBe('A');
      // ScrollIntoView used to put a div between the list and every last entry
      expect(container.querySelectorAll('.DriveList > div')).toHaveLength(0);
    });

    it('asks for more once it scrolls into view', () => {
      const onloadmore = vi.fn();
      mount({ routes, onloadmore });

      observed[0].fire();

      expect(onloadmore).toHaveBeenCalledTimes(1);
    });

    it('asks only once, however often it crosses the threshold', () => {
      const onloadmore = vi.fn();
      mount({ routes, onloadmore });

      observed[0].fire();
      observed[0].fire();

      expect(onloadmore).toHaveBeenCalledTimes(1);
    });

    it('watches nothing while the list is empty', () => {
      mount({ routes: [] });
      expect(observed).toHaveLength(0);
    });
  });

  it('asks the parent to open the filter', async () => {
    const onfilter = vi.fn();
    mount({ onfilter });

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));

    expect(onfilter).toHaveBeenCalled();
  });
});
