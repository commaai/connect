import { vi } from 'vitest';
import { push } from 'connected-react-router';

import { checkRoutesData, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';
import * as Types from './types';
import { api } from '../api/backend';
import { hasRoutesData } from '../timeline/segments';

vi.mock('../timeline', () => ({ currentOffset: vi.fn(() => 0) }));
vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));
vi.mock('../timeline/segments', () => ({ hasRoutesData: vi.fn(() => false) }));
vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn(() => true) },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((pathname) => ({ type: 'PUSH', pathname })),
  };
});

const route = { log_id: 'log_id', duration: 60000 };

function run(action, { pathname = '/', ...state } = {}) {
  const dispatch = vi.fn();
  const getState = () => ({
    router: { location: { pathname } },
    dongleId: 'statedongle',
    routes: [route],
    lastRoutes: null,
    ...state,
  });
  action(dispatch, getState);
  return dispatch;
}

const pushedPath = () => push.mock.calls[push.mock.calls.length - 1]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigation actions push one canonical URL', () => {
  it.each([
    ['a device dashboard', () => selectDevice('statedongle'), '/statedongle'],
    ['Prime', () => primeNav(true), '/statedongle/prime'],
    ['the dashboard from Prime', () => primeNav(false), '/statedongle'],
    ['stream', () => streamNav(true), '/statedongle/stream'],
    ['the dashboard from stream', () => streamNav(false), '/statedongle'],
  ])('pushes %s', (_name, makeAction, expected) => {
    run(makeAction(), { pathname: '/elsewhere' });
    expect(pushedPath()).toBe(expected);
  });

  it.each([
    ['whole drive', ['log_id', 0, 60000], '/statedongle/log_id'],
    ['drive range', ['log_id', 10000, 20000], '/statedongle/log_id/10/20'],
    ['zero-start range', ['log_id', 0, 20000], '/statedongle/log_id/0/20'],
    ['a degenerate zero-length selection', ['log_id', 10000, 10000], '/statedongle/log_id/10/11'],
    ['dashboard', [null, null, null], '/statedongle'],
  ])('pushes the %s', (_name, args, expected) => {
    run(pushTimelineRange(...args), { pathname: '/elsewhere' });
    expect(pushedPath()).toBe(expected);
  });

  it('does not push when the URL already matches', () => {
    const dispatch = run(primeNav(true), { pathname: '/statedongle/prime' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing without a selected device', () => {
    const dispatch = run(primeNav(true), { dongleId: null });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('checkRoutesData request coalescing', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
  };

  const routeData = (logId) => ({
    fullname: `statedongle|${logId}`,
    create_time: 0,
    url: 'https://routes.example.com/x',
    segment_start_times: [0],
    segment_end_times: [60000],
    segment_numbers: [0],
    start_time_utc_millis: 0,
    end_time_utc_millis: 60000,
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  function makeRunner() {
    const dispatched = [];
    let state = {
      router: { location: { pathname: '/statedongle' } },
      dongleId: 'statedongle',
      filter: { start: 0, end: 1 },
      limit: 5,
      selectedRouteId: null,
      routes: null,
      profile: { superuser: false },
    };
    const dispatch = vi.fn((action) => {
      dispatched.push(action);
      if (typeof action === 'function') {
        action(dispatch, () => state);
      }
      return action;
    });
    return {
      dispatched,
      setState: (over) => { state = { ...state, ...over }; },
      dispatch,
    };
  }

  beforeEach(() => {
    hasRoutesData.mockReturnValue(false);
  });

  it('a stale response must not clobber a newer request\'s coalescing slot', async () => {
    const first = deferred();
    const second = deferred();
    const pending = [first, second];
    const calls = [];
    api.routes.getRoutesSegments.mockImplementation((...args) => {
      calls.push(args);
      return pending[calls.length - 1].promise;
    });

    const runner = makeRunner();
    runner.setState({ selectedRouteId: 'log1' });
    runner.dispatch(checkRoutesData());
    expect(calls).toHaveLength(1);

    // The user switches drives while the first lookup is still in flight.
    runner.setState({ selectedRouteId: 'log2' });
    runner.dispatch(checkRoutesData());
    expect(calls).toHaveLength(2);

    // The stale response arrives: it must trigger no fetch and no metadata,
    // and the newer request must still own the coalescing slot.
    first.resolve([routeData('log1')]);
    await flush();
    expect(calls).toHaveLength(2);
    expect(runner.dispatched.filter((a) => a?.type === Types.ACTION_ROUTES_METADATA)).toHaveLength(0);

    // The current response resolves normally.
    second.resolve([routeData('log2')]);
    await flush();
    const metadata = runner.dispatched.filter((a) => a?.type === Types.ACTION_ROUTES_METADATA);
    expect(metadata).toHaveLength(1);
    expect(metadata[0].routes.map((r) => r.log_id)).toEqual(['log2']);
    expect(metadata[0].routeOnly).toBe(true);
  });

  it('a duplicate caller joins the in-flight request', async () => {
    const first = deferred();
    api.routes.getRoutesSegments.mockReturnValue(first.promise);

    const runner = makeRunner();
    runner.dispatch(checkRoutesData());
    runner.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);

    first.resolve([routeData('log_id')]);
    await flush();
    const metadata = runner.dispatched.filter((a) => a?.type === Types.ACTION_ROUTES_METADATA);
    expect(metadata).toHaveLength(1);
  });
});
