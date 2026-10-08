import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState, checkRoutesData } from './index';
import * as Types from './types';
import { resetPlayback, selectLoop } from '../timeline/playback';

const mocks = vi.hoisted(() => ({ getRoutesSegments: vi.fn(), isAuthenticated: vi.fn(() => true) }));

vi.mock('../api/backend', () => ({
  api: {
    routes: { getRoutesSegments: mocks.getRoutesSegments },
    auth: { isAuthenticated: mocks.isAuthenticated },
  },
}));

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

describe('timeline actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRoutesSegments.mockReset();
    mocks.isAuthenticated.mockReturnValue(true);
  });

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

    getState.mockImplementationOnce(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
    }));
    actionThunk(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id/0/1');
  });

  it('keeps a valid zero-offset playback loop and normalized whole-drive range', () => {
    const route = { log_id: 'route', duration: 60000 };
    const state = {
      dongleId: 'device',
      selectedRouteId: 'route',
      currentRoute: route,
      routes: [route],
      zoom: { start: 0, end: 60000 },
      loop: { startTime: 0, duration: 60000 },
    };
    const dispatch = vi.fn();

    pushTimelineRange('route', 0, 60000, false)(dispatch, () => state);
    pushTimelineRange('route', null, null, false)(dispatch, () => state);

    expect(dispatch).not.toHaveBeenCalled();
    expect(resetPlayback).not.toHaveBeenCalled();
    expect(selectLoop).not.toHaveBeenCalled();
  });

  it('resets playback when a different route has the same range', () => {
    const route = { log_id: 'next', duration: 60000 };
    const state = {
      dongleId: 'device',
      selectedRouteId: 'previous',
      currentRoute: { log_id: 'previous', duration: 60000 },
      routes: [route],
      zoom: { start: 0, end: 60000 },
      loop: { startTime: 0, duration: 60000 },
    };

    pushTimelineRange('next', 0, 60000, false)(vi.fn(), () => state);

    expect(resetPlayback).toHaveBeenCalledOnce();
    expect(selectLoop).toHaveBeenCalledWith(0, 60000);
  });

  it('ignores stale same-device route metadata responses', async () => {
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      return { promise, resolve };
    };
    const first = deferred();
    const second = deferred();
    mocks.getRoutesSegments.mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const device = '0000aaaa0000aaaa';
    const routeData = (logId) => ({
      fullname: `${device}|${logId}`,
      segment_start_times: [1000],
      segment_end_times: [61000],
      start_time_utc_millis: 1000,
      end_time_utc_millis: 61000,
      segment_numbers: [0],
      create_time: 1,
      url: 'https://example.test/route',
    });
    let state = {
      dongleId: device,
      selectedRouteId: 'route-a',
      filter: { start: 0, end: 100 },
      limit: 5,
      routes: [{ log_id: 'cached', fullname: `${device}|cached` }],
    };
    const dispatch = vi.fn();
    const getState = () => state;
    const staleRequest = checkRoutesData()(dispatch, getState);
    state = { ...state, selectedRouteId: 'route-b' };
    const currentRequest = checkRoutesData()(dispatch, getState);

    first.resolve([routeData('route-a')]);
    await staleRequest;
    expect(dispatch).not.toHaveBeenCalled();

    second.resolve([routeData('route-b')]);
    await currentRequest;
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_ROUTES_METADATA,
      routes: expect.arrayContaining([
        expect.objectContaining({ log_id: 'cached' }),
        expect.objectContaining({ log_id: 'route-b' }),
      ]),
    }));
    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
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
