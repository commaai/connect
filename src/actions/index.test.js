import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkLastRoutesData, checkRoutesData, selectTimelineRange } from './index';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getRoutesSegments: vi.fn(),
}));

vi.unmock('./index');
vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => mocks.authenticated },
    routes: { getRoutesSegments: mocks.getRoutesSegments },
  },
  selectBackendType: () => 'real',
}));
vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'RESET_PLAYBACK' })),
}));

beforeEach(() => {
  mocks.authenticated = true;
  mocks.getRoutesSegments.mockReset();
});

describe('navigation state actions', () => {
  it('treats zero as a real range boundary', () => {
    const dispatch = vi.fn();
    const getState = () => ({
      loop: null, routes: [], selectedRouteId: null, zoom: null,
    });
    selectTimelineRange('route', 0, 20000)(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      log_id: 'route', start: 0, end: 20000,
    }));
  });

  it('resets playback when leaving a range for the whole drive', () => {
    const dispatch = vi.fn();
    const getState = () => ({
      loop: { startTime: 10000, duration: 10000 },
      routes: [{ log_id: 'route', duration: 60000 }],
      selectedRouteId: 'route',
      zoom: { start: 10000, end: 20000 },
    });
    selectTimelineRange('route', null, null)(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_PLAYBACK' });
  });

  it('loads the dashboard after a direct-drive-only fetch', () => {
    const dispatch = vi.fn();
    const state = {
      dongleId: '0000aaaa0000aaaa',
      filter: { start: 1, end: 2 },
      limit: 5,
      routes: [{ log_id: 'route' }],
      routesMeta: { dongleId: null, start: null, end: null },
    };
    checkLastRoutesData()(dispatch, () => state);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ACTION_UPDATE_ROUTE_LIMIT', limit: 5,
    }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ACTION_SELECT_TIME_FILTER', start: 1, end: 2,
    }));
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('starts the current route request when an obsolete request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectFirst;
    mocks.getRoutesSegments
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce([]);
    const state = {
      dongleId: '0000aaaa0000aaaa',
      filter: { start: 1, end: 2 },
      limit: 5,
      routes: null,
      selectedRouteId: '2026-08-06--12-00-00',
    };
    const getState = () => state;
    const dispatch = vi.fn((action) => (
      typeof action === 'function' ? action(dispatch, getState) : action
    ));

    try {
      const first = checkRoutesData()(dispatch, getState);
      state.selectedRouteId = '2026-08-06--13-00-00';
      rejectFirst(new Error('obsolete request'));
      await first;

      await vi.waitFor(() => expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2));
      expect(mocks.getRoutesSegments.mock.calls[1][4])
        .toBe('0000aaaa0000aaaa|2026-08-06--13-00-00');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('starts a new selected-route request without waiting for another route', async () => {
    let resolveFirst;
    const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
    mocks.getRoutesSegments
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce([]);
    const state = {
      dongleId: '0000aaaa0000aaaa',
      filter: { start: 1, end: 2 },
      limit: 5,
      routes: null,
      selectedRouteId: '2026-08-06--12-00-00',
    };
    const getState = () => state;
    const dispatch = vi.fn((action) => (
      typeof action === 'function' ? action(dispatch, getState) : action
    ));

    const first = checkRoutesData()(dispatch, getState);
    state.selectedRouteId = '2026-08-06--13-00-00';
    const second = checkRoutesData()(dispatch, getState);

    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
    expect(mocks.getRoutesSegments.mock.calls[1][4])
      .toBe('0000aaaa0000aaaa|2026-08-06--13-00-00');
    resolveFirst([]);
    await Promise.all([first, second]);
    const metadata = dispatch.mock.calls
      .map(([action]) => action)
      .filter((action) => action?.type === 'ACTION_CURRENT_ROUTE');
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      logId: '2026-08-06--13-00-00',
      route: null,
    });
  });
});
