import { vi } from 'vitest';

import { api } from '../api/backend';
import { checkRoutesData } from './index';
import { ACTION_CURRENT_ROUTE, ACTION_ROUTES_METADATA } from './types';

vi.mock('../api/backend', () => ({
  api: { auth: { isAuthenticated: () => true }, routes: { getRoutesSegments: vi.fn() } },
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const filter = { start: 1000, end: 2000 };
const route = {
  fullname: `${DONGLE}|${LOG}`, url: 'https://routes.example.com', create_time: 0, distance: 1,
  segment_numbers: [0], segment_start_times: [1000], segment_end_times: [61000],
  start_time_utc_millis: 1000, end_time_utc_millis: 61000,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('checkRoutesData', () => {
  let state;
  const dispatch = vi.fn();
  const getState = () => state;
  const listState = { dongleId: DONGLE, selectedRouteId: null, currentRoute: null, filter, limit: 5, routes: null, routesMeta: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads one drive into currentRoute, apart from the list', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([route]);
    state = { ...listState, selectedRouteId: LOG };
    await checkRoutesData()(dispatch, getState);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, undefined, undefined, undefined, `${DONGLE}|${LOG}`);
    expect(dispatch).toHaveBeenCalledWith({
      type: ACTION_CURRENT_ROUTE,
      route: expect.objectContaining({ fullname: `${DONGLE}|${LOG}`, log_id: LOG, duration: 60000 }),
    });
  });

  it('does not look up a drive again once it is known to be missing', () => {
    state = { ...listState, selectedRouteId: LOG, currentRouteMissing: true };
    checkRoutesData()(dispatch, getState);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('keys pending requests by what they fetch', async () => {
    const drive = deferred();
    const list = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(drive.promise).mockReturnValueOnce(list.promise);

    state = { ...listState, selectedRouteId: LOG };
    const drivePromise = checkRoutesData()(dispatch, getState);
    expect(checkRoutesData()(dispatch, getState)).toBe(drivePromise);

    state = listState;
    const listPromise = checkRoutesData()(dispatch, getState);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    expect(api.routes.getRoutesSegments).toHaveBeenLastCalledWith(DONGLE, 1000, 2000, 5);

    drive.resolve([route]);
    list.resolve([route]);
    await Promise.all([drivePromise, listPromise]);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: ACTION_ROUTES_METADATA, start: 1000, end: 2000 }));
  });

  it.each([
    ['fails', (older) => older.reject(new Error('older request failed'))],
    ['answers first', (older) => older.resolve([{ ...route, distance: 1 }])],
  ])('keeps the newest request for a drive when an older one %s', async (_name, settleOlder) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const older = deferred();
    const list = deferred();
    const newer = deferred();
    api.routes.getRoutesSegments
      .mockReturnValueOnce(older.promise).mockReturnValueOnce(list.promise).mockReturnValueOnce(newer.promise);

    const driveState = { ...listState, selectedRouteId: LOG };
    state = driveState;
    checkRoutesData()(dispatch, getState);
    state = listState;
    checkRoutesData()(dispatch, getState);
    state = driveState;
    const newerPromise = checkRoutesData()(dispatch, getState);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(3);

    settleOlder(older);
    await new Promise((resolve) => setTimeout(resolve, 0));
    newer.resolve([{ ...route, distance: 2 }]);
    await newerPromise;
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: ACTION_CURRENT_ROUTE, route: expect.objectContaining({ distance: 2 }) });
  });
});
