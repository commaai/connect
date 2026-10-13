import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { checkRoutesData, primeNav, pushTimelineRange, streamNav, urlForState } from './index';
import { api } from '../api/backend';
import * as Types from './types';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(() => ({ type: 'reset' })),
  selectLoop: vi.fn(() => ({ type: 'loop' })),
  seek: vi.fn(() => ({ type: 'seek' })),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

describe('route metadata lifetime', () => {
  let state;
  let dispatch;
  let fetchRoutes;
  beforeEach(() => {
    state = { dongleId: 'dongle', selectedRouteId: 'one', routes: null, routesMeta: null,
      filter: { start: 0, end: 100000 }, limit: 5 };
    fetchRoutes = vi.spyOn(api.routes, 'getRoutesSegments');
    vi.spyOn(api.auth, 'isAuthenticated').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dispatch = vi.fn((action) => {
      if (typeof action === 'function') return action(dispatch, () => state);
      if (action.type === Types.ACTION_ROUTES_ERROR) state.routesError = action.error;
      if (action.type === Types.ACTION_ROUTES_METADATA) {
        state.routes = action.routes;
        state.routesMeta = { dongleId: action.dongleId, start: action.start,
          end: action.end, selectedRouteId: action.selectedRouteId };
      }
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('coalesces the same request and allows retry after failure', async () => {
    let reject;
    fetchRoutes.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const pending = dispatch(checkRoutesData());
    expect(dispatch(checkRoutesData())).toBe(pending);
    expect(fetchRoutes).toHaveBeenCalledOnce();
    reject(new Error('offline'));
    await pending;
    expect(state.routesError).toContain('Unable to load');
    fetchRoutes.mockResolvedValueOnce([]);
    await dispatch(checkRoutesData());
    expect(fetchRoutes).toHaveBeenCalledTimes(2);
    expect(state.routesError).toBeNull();
  });

  it('bounds a stalled request and ignores its late resolution', async () => {
    vi.useFakeTimers();
    let resolve;
    fetchRoutes.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = dispatch(checkRoutesData());
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
    expect(state.routesError).toContain('Unable to load');
    resolve([]);
    await Promise.resolve();
    expect(state.routes).toBeNull();
    fetchRoutes.mockResolvedValueOnce([]);
    await dispatch(checkRoutesData());
    expect(state.routesError).toBeNull();
  });

  it('starts a changed filter request immediately and keeps a stale failure out of current state', async () => {
    let reject;
    fetchRoutes.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const previous = dispatch(checkRoutesData());
    state.filter = { start: 1000, end: 100000 };
    fetchRoutes.mockResolvedValueOnce([]);
    await dispatch(checkRoutesData());
    reject(new Error('old request failed'));
    await previous;
    expect(fetchRoutes).toHaveBeenCalledTimes(2);
    expect(state.routesError).toBeNull();
    expect(state.routesMeta.start).toBe(1000);
  });
});

describe('timeline actions', () => {
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementation(() => ({
      dongleId: 'statedongle',
      loop: { startTime: 0, duration: 2000 },
      selectedRouteId: 'log_id',
      currentRoute: { fullname: 'statedongle|log_id', duration: 60000 },
      zoom: { start: 0, end: 2000 },
      routes: [{ log_id: 'log_id', duration: 60000 }],
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0/2');
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });
});
