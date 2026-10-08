import { vi } from 'vitest';

import { api } from '../api/backend';
import { checkRoutesData } from './index';
import { ACTION_ROUTES_METADATA } from './types';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    routes: { getRoutesSegments: vi.fn() },
  },
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const filter = { start: 1000, end: 100000 };
const route = {
  fullname: `${DONGLE}|${LOG}`, url: 'https://routes.example.com', create_time: 1000,
  segment_numbers: [0], segment_start_times: [1000], segment_end_times: [61000],
  start_time_utc_millis: 1000, end_time_utc_millis: 61000,
};

async function fetchRoutes(selectedRouteId) {
  const state = {
    dongleId: DONGLE, devices: [], filter, limit: 5, selectedRouteId,
    routes: null, routesMeta: { dongleId: null, start: null, end: null },
  };
  const dispatch = vi.fn();
  await checkRoutesData()(dispatch, () => state);
  return dispatch.mock.calls.map(([action]) => action).find((action) => action.type === ACTION_ROUTES_METADATA);
}

describe('checkRoutesData', () => {
  beforeEach(() => {
    api.routes.getRoutesSegments.mockResolvedValue([route]);
  });

  it('fetches the drive list for the filter', async () => {
    const action = await fetchRoutes(null);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, filter.start, filter.end, 5);
    expect(action).toMatchObject({ dongleId: DONGLE, start: filter.start, end: filter.end });
  });

  it('fetches only the drive opened by its URL, without taking it for the drive list', async () => {
    const action = await fetchRoutes(LOG);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, undefined, undefined, undefined, `${DONGLE}|${LOG}`);
    expect(action).toMatchObject({ dongleId: DONGLE, start: null, end: null });
    expect(action.routes).toHaveLength(1);
  });
});
