/* eslint-env jest */
import { push } from 'connected-react-router';
import {
  pushTimelineRange,
  checkRoutesData,
  selectTimeFilter,
  invalidateRoutesAfterLeavingSegment,
  __resetRoutesRequestForTests,
} from './index';
import { drives as Drives } from '../api';
import * as Types from './types';

jest.mock('connected-react-router', () => {
  const originalModule = jest.requireActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: jest.fn(),
  };
});

jest.mock('../api', () => ({
  drives: {
    getRoutesSegments: jest.fn(),
  },
  devices: {},
  athena: {},
  billing: {},
}));

jest.mock('@commaai/my-comma-auth', () => ({
  __esModule: true,
  default: {
    isAuthenticated: jest.fn(() => true),
  },
}));

describe('timeline actions', () => {
  beforeEach(() => {
    __resetRoutesRequestForTests();
    jest.clearAllMocks();
  });

  it('should push history state when editing zoom', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => ({
      dongleId: 'statedongle',
      loop: {},
      zoom: {},
      segmentRange: null,
      routes: null,
    }));
    pushTimelineRange('log_id', 123, 1234)(dispatch, getState);
    expect(push).toBeCalledWith('/statedongle/log_id');
  });

  it('invalidates routes cache when clearing segmentRange via close', () => {
    const dispatch = jest.fn((a) => {
      if (typeof a === 'function') a(dispatch, getState);
    });
    const getState = jest.fn(() => ({
      dongleId: 'dongleA',
      loop: {},
      zoom: { start: 0, end: 1000 },
      segmentRange: { log_id: 'abc', start: 1, end: 2 },
      routes: [{ fullname: 'dongleA|abc', is_preserved: true }],
      routesMeta: { dongleId: 'dongleA', start: 0, end: 9 },
      filter: { start: 0, end: 9 },
      limit: 5,
    }));

    pushTimelineRange(null, null, null)(dispatch, getState);

    const types = dispatch.mock.calls.map((c) => c[0]?.type).filter(Boolean);
    expect(types).toContain(Types.ACTION_INVALIDATE_ROUTES_CACHE);
  });

  it('drops stale segment then when leaving segment for list fetch', async () => {
    let resolveSeg;
    const segPromise = new Promise((r) => { resolveSeg = r; });
    let resolveList;
    const listPromise = new Promise((r) => { resolveList = r; });
    Drives.getRoutesSegments
      .mockReturnValueOnce(segPromise)
      .mockReturnValueOnce(listPromise);

    let state = {
      dongleId: 'dongleA',
      filter: { start: 100, end: 200 },
      limit: 5,
      routes: null,
      routesMeta: { dongleId: null, start: null, end: null },
      segmentRange: { log_id: 'segA', start: 0, end: 1 },
      devices: [{ dongle_id: 'dongleA' }],
    };
    const getState = jest.fn(() => state);
    const dispatch = jest.fn((a) => {
      if (typeof a === 'function') return a(dispatch, getState);
      if (a?.type === Types.ACTION_INVALIDATE_ROUTES_CACHE) {
        state = {
          ...state,
          lastRoutes: state.routes ?? state.lastRoutes,
          routes: null,
          routesMeta: { dongleId: null, start: null, end: null },
        };
      }
      return a;
    });

    checkRoutesData()(dispatch, getState);

    state = {
      ...state,
      segmentRange: null,
    };
    invalidateRoutesAfterLeavingSegment()(dispatch, getState);

    resolveSeg([{
      fullname: 'dongleA|segA',
      url: 'https://chffrprivate.blob.core.windows.net/x',
      segment_start_times: [100],
      segment_end_times: [200],
      segment_numbers: [0],
      start_time_utc_millis: 100,
      end_time_utc_millis: 200,
      create_time: 1,
      is_preserved: true,
    }]);
    resolveList([]);

    await segPromise;
    await listPromise;

    const metaActions = dispatch.mock.calls
      .map((c) => c[0])
      .filter((a) => a && a.type === Types.ACTION_ROUTES_METADATA);
    expect(metaActions.filter((a) => a.routes.length === 1 && a.routes[0].log_id === 'segA')).toHaveLength(0);
    expect(metaActions.some((a) => Array.isArray(a.routes) && a.routes.length === 0)).toBe(true);
  });

  it('selectTimeFilter sets numeric limit not undefined', () => {
    const dispatch = jest.fn((a) => {
      if (typeof a === 'function') a(dispatch, getState);
    });
    const getState = jest.fn(() => ({
      dongleId: 'dongleA',
      filter: { start: 1, end: 2 },
      limit: 5,
      routes: null,
      routesMeta: { dongleId: null, start: null, end: null },
      segmentRange: null,
      devices: [{ dongle_id: 'dongleA' }],
    }));
    Drives.getRoutesSegments.mockReturnValue(Promise.resolve([]));

    selectTimeFilter(10, 20)(dispatch, getState);

    const limitAction = dispatch.mock.calls
      .map((c) => c[0])
      .find((a) => a && a.type === Types.ACTION_UPDATE_ROUTE_LIMIT);
    expect(typeof limitAction.limit).toBe('number');
    expect(limitAction.limit).toBeGreaterThan(0);
  });
});
