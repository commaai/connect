import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { api } from '../api/backend';
import * as Types from './types';
import { checkRoutesData, primeNav, pushTimelineRange, streamNav, urlForState } from './index';

vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn(),
  };
});

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn(() => true) },
    routes: { getRoutesSegments: vi.fn() },
  },
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('timeline actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['fractional drive range', ['dongle', 'log', 0.5, 20.25, false], '/dongle/log/0.5/20.25'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log/0/20'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  it('should push history state when editing zoom', () => {
    const dispatch = vi.fn();
    const getState = vi.fn();
    const actionThunk = pushTimelineRange("log_id", 123, 1234);

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0.123/1.234');
  });

  it('does not generate a non-finite range URL', () => {
    const dispatch = vi.fn();
    const getState = vi.fn(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));

    pushTimelineRange('log_id', 0, NaN)(dispatch, getState);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: 'log_id',
      start: null,
      end: null,
    }));
    expect(push).toBeCalledWith('/statedongle/log_id');
  });

  it('does not refetch route metadata when the selected route is already loaded', () => {
    const dispatch = vi.fn();
    checkRoutesData()(dispatch, () => ({
      dongleId: 'dongle',
      selectedRouteId: 'route-a',
      currentRoute: { log_id: 'route-a' },
      routes: [{ log_id: 'route-a' }],
      routesMeta: { dongleId: 'dongle', start: null, end: null },
      filter: { start: null, end: null },
      limit: 5,
    }));

    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('reuses an in-flight selected-route request across range changes', async () => {
    const request = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(request.promise);

    const state = {
      dongleId: 'dongle',
      selectedRouteId: 'route-a',
      currentRoute: null,
      routes: null,
      routesMeta: {},
      filter: { start: null, end: null },
      limit: 5,
    };
    const dispatch = vi.fn();

    const firstRequest = checkRoutesData()(dispatch, () => state);
    state.filter = { start: 0, end: 20000 };
    const secondRequest = checkRoutesData()(dispatch, () => state);

    expect(secondRequest).toBe(firstRequest);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith('dongle', undefined, undefined, undefined, 'dongle|route-a');

    request.resolve([]);
    await firstRequest;
  });

  it.each([
    ['Prime', primeNav, 'primeNav', '/statedongle/prime'],
    ['stream', streamNav, 'streamNav', '/statedongle/stream'],
  ])('generates the %s URL while opening', (_name, action, stateKey, expected) => {
    const dispatch = vi.fn();
    action(true)(dispatch, () => ({ dongleId: 'statedongle', [stateKey]: false }));
    expect(push).toHaveBeenCalledWith(expected);
  });

  it('does not let stale same-device selected-route fetches overwrite current route data', async () => {
    const first = deferred();
    const second = deferred();
    api.routes.getRoutesSegments
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const state = {
      dongleId: 'dongle',
      selectedRouteId: 'route-a',
      routes: null,
      routesMeta: {},
      filter: { start: null, end: null },
      limit: 5,
      router: { location: { pathname: '/dongle/route-a' } },
    };
    const dispatch = vi.fn((action) => {
      if (typeof action === 'function') {
        return action(dispatch, () => state);
      }
      return action;
    });

    const firstRequest = checkRoutesData()(dispatch, () => state);
    state.selectedRouteId = 'route-b';
    state.router.location.pathname = '/dongle/route-b';
    const secondRequest = checkRoutesData()(dispatch, () => state);

    expect(api.routes.getRoutesSegments).toHaveBeenNthCalledWith(1, 'dongle', undefined, undefined, undefined, 'dongle|route-a');
    expect(api.routes.getRoutesSegments).toHaveBeenNthCalledWith(2, 'dongle', undefined, undefined, undefined, 'dongle|route-b');

    first.resolve([{
      fullname: 'dongle|route-a',
      url: 'https://chffrprivate.blob.core.windows.net/a',
      segment_start_times: [0],
      segment_end_times: [1000],
      segment_numbers: [0],
      start_time_utc_millis: 0,
      end_time_utc_millis: 1000,
      create_time: 1,
    }]);
    await firstRequest;

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_ROUTES_METADATA,
      dongleId: 'dongle',
      routes: [expect.objectContaining({ log_id: 'route-a' })],
    }));

    second.resolve([{
      fullname: 'dongle|route-b',
      url: 'https://chffrprivate.blob.core.windows.net/b',
      segment_start_times: [0],
      segment_end_times: [2000],
      segment_numbers: [0],
      start_time_utc_millis: 0,
      end_time_utc_millis: 2000,
      create_time: 2,
    }]);
    await secondRequest;

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_ROUTES_METADATA,
      dongleId: 'dongle',
      routes: [expect.objectContaining({ log_id: 'route-b' })],
    }));
  });
});
