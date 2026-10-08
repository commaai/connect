import { vi } from 'vitest';
import { push } from 'connected-react-router';
import { primeNav, pushTimelineRange, streamNav, urlForState, checkRoutesData } from './index';
import * as Types from './types';

const { getRoutesSegments } = vi.hoisted(() => ({
  getRoutesSegments: vi.fn(),
}));

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn(() => true) },
    routes: { getRoutesSegments },
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
  it.each([
    ['device', ['dongle', null, null, null, false], '/dongle'],
    ['whole drive', ['dongle', 'log', null, null, false], '/dongle/log'],
    ['drive range', ['dongle', 'log', 10, 20, false], '/dongle/log/10/20'],
    ['zero-start drive range', ['dongle', 'log', 0, 20, false], '/dongle/log'],
    ['Prime', ['dongle', null, null, null, true], '/dongle/prime'],
  ])('generates a %s URL', (_name, args, expected) => {
    expect(urlForState(...args)).toBe(expected);
  });

  describe('route metadata fetching', () => {
    beforeEach(() => {
      getRoutesSegments.mockReset();
    });

    it('does not mark a route-only refresh as a complete dashboard range', async () => {
      getRoutesSegments.mockResolvedValue([]);
      const dispatch = vi.fn();
      const getState = vi.fn(() => ({
        dongleId: 'device',
        selectedRouteId: 'route',
        filter: { start: 100, end: 200 },
        limit: 5,
        routes: null,
        routesMeta: { dongleId: null, start: null, end: null },
      }));

      await checkRoutesData()(dispatch, getState);

      expect(getRoutesSegments).toHaveBeenCalledWith(
        'device', undefined, undefined, undefined, 'device|route',
      );
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: Types.ACTION_ROUTES_METADATA,
        dongleId: 'device',
        start: null,
        end: null,
      }));
    });

    it('rechecks route metadata if the route selection changes while the request is pending', async () => {
      let state = {
        dongleId: 'device',
        selectedRouteId: 'route',
        filter: { start: 100, end: 200 },
        limit: 5,
        routes: null,
        routesMeta: { dongleId: null, start: null, end: null },
      };
      let resolveRequest;
      getRoutesSegments.mockReturnValue(new Promise((resolve) => {
        resolveRequest = resolve;
      }));
      const dispatch = vi.fn((action) => {
        if (typeof action === 'function') {
          return action(dispatch, () => state);
        }
        return action;
      });

      const request = checkRoutesData()(dispatch, () => state);
      state = { ...state, selectedRouteId: null };
      resolveRequest([]);
      await request;

      expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
    });
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
