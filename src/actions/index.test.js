import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { api } from '../api/backend';
import * as Types from './types';
import { checkRoutesData, primeNav, pushTimelineRange, streamNav, urlForState } from './index';

vi.mock('../api/backend', () => ({
  api: { routes: { getRoutesSegments: vi.fn() }, auth: { isAuthenticated: () => true } },
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
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log'],
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
    expect(push).toBeCalledWith('/statedongle/log_id');
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

describe('checkRoutesData', () => {
  const state = {
    dongleId: 'dongle', limit: 5, filter: { start: 100, end: 200 }, devices: [{}], routes: null,
    routesMeta: { dongleId: null, start: null, end: null }, selectedRouteId: null,
  };

  it.each([
    ['the time range for the drive list', null, 100, 200],
    // a drive opened by its URL is fetched alone, so the list must still load when going back to it
    ['nothing for a drive fetched on its own', 'log', null, null],
  ])('records %s as loaded', async (_name, selectedRouteId, start, end) => {
    api.routes.getRoutesSegments.mockResolvedValue([{
      fullname: 'dongle|log', url: 'https://routes.test', segment_numbers: [0],
      segment_start_times: [0], segment_end_times: [60000], start_time_utc_millis: 0, end_time_utc_millis: 60000,
    }]);
    const dispatch = vi.fn();
    await checkRoutesData()(dispatch, () => ({ ...state, selectedRouteId }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_ROUTES_METADATA, start, end }));
  });
});
