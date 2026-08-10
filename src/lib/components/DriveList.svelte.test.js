import { render, screen, waitFor } from '@testing-library/svelte';
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

const JUN_1 = new Date(2026, 5, 1, 9, 0).getTime();
const DAY = 86400000;

beforeEach(() => {
  isMetric.mockReturnValue(false);
  fetchDeviceStats.mockResolvedValue(stats);
  globalThis.IntersectionObserver ??= class {
    observe() {}

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

  it('asks the parent to open the filter', async () => {
    const onfilter = vi.fn();
    mount({ onfilter });

    await userEvent.click(screen.getByRole('button', { name: /Filter/ }));

    expect(onfilter).toHaveBeenCalled();
  });
});
