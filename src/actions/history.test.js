import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api, initBackend } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { resetPlayback } from '../timeline/playback';
import * as Types from './types';
import { closeOverlay, onHistoryMiddleware, openOverlay, syncStateFromUrl } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  initBackend: vi.fn(),
  api: {
    auth: { isAuthenticated: vi.fn(() => true), logOut: vi.fn() },
    account: { getProfile: vi.fn() },
    devices: { listDevices: vi.fn(), fetchDevice: vi.fn() },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));
vi.mock('../timeline/playback', () => ({ resetPlayback: vi.fn() }));
vi.mock('./index', () => ({
  checkRoutesData: vi.fn((options) => ({ type: 'CHECK_ROUTES', options })),
  checkLastRoutesData: vi.fn(() => ({ type: 'CHECK_LAST_ROUTES' })),
  fetchDeviceOnline: vi.fn((dongleId) => ({ type: 'FETCH_ONLINE', dongleId })),
  primeFetchSubscription: vi.fn((dongleId) => ({ type: 'FETCH_SUBSCRIPTION', dongleId })),
  selectTimeFilter: vi.fn((start, end) => ({ type: 'SELECT_FILTER', start, end })),
}));
vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    push: vi.fn((location) => (
      typeof location === 'string'
        ? { type: 'PUSH', pathname: location }
        : { type: 'PUSH', ...location }
    )),
    replace: vi.fn((pathname) => ({ type: 'REPLACE', pathname })),
    goBack: vi.fn(() => ({ type: 'GO_BACK' })),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const UNKNOWN = '2222cccc2222cccc';
const LOG = '2026-08-06--12-00-00';
const notFound = (dongleId) => ({
  type: Types.ACTION_APPLY_DESTINATION,
  destination: { kind: 'not-found', dongleId },
});

const baseState = {
  router: { location: { pathname: `/${DONGLE}`, search: '' } },
  dongleId: DONGLE,
  destinationKind: 'dashboard',
  device: { dongle_id: DONGLE },
  devices: [{ dongle_id: DONGLE, is_owner: true }, { dongle_id: OTHER, is_owner: true }],
  profile: { id: 'profile' },
  routes: [],
  routesMeta: { dongleId: DONGLE, start: 0, end: 1, routeOnly: false },
  selectedRouteId: null,
  zoom: null,
  primeNav: false,
  streamNav: false,
};

function run(url, state = baseState) {
  const current = {
    ...state,
    router: { location: { pathname: url, search: state.router?.location?.search ?? '' } },
  };
  const dispatched = [];
  const dispatch = vi.fn((action) => {
    dispatched.push(action);
    return typeof action === 'function' ? action(dispatch, () => current) : action;
  });
  return { dispatched, dispatch, state: current, promise: dispatch(syncStateFromUrl(url)) };
}

const destinations = (dispatched) => dispatched
  .filter((action) => action?.type === Types.ACTION_APPLY_DESTINATION)
  .map((action) => action.destination);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.auth.isAuthenticated.mockReturnValue(true);
  api.account.getProfile.mockResolvedValue({ id: 'profile' });
  api.devices.listDevices.mockResolvedValue(baseState.devices);
});

describe('onHistoryMiddleware', () => {
  it('passes the action through and syncs any location change', () => {
    const store = { dispatch: vi.fn() };
    const next = vi.fn(() => 'result');
    const action = { type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname: `/${DONGLE}` } } };

    expect(onHistoryMiddleware(store)(next)(action)).toBe('result');
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('ignores an absent action', () => {
    const next = vi.fn();
    expect(onHistoryMiddleware({ dispatch: vi.fn() })(next)()).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('syncStateFromUrl', () => {
  it('applies the dashboard destination for a direct device link', async () => {
    const { dispatched } = run(`/${OTHER}`);
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({ kind: 'dashboard', dongleId: OTHER });
    expect(actions.checkLastRoutesData).toHaveBeenCalled();
  });

  it('does not re-apply a destination the store already matches', async () => {
    const { dispatched } = run(`/${DONGLE}`);
    await Promise.resolve();
    expect(destinations(dispatched)).toEqual([]);
  });

  it('redirects the root to the remembered device', async () => {
    window.localStorage.setItem('selectedDongleId', OTHER);
    const { dispatched } = run('/', { ...baseState, dongleId: null, destinationKind: null });
    await Promise.resolve();
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${OTHER}` });
  });

  it('honors a safe ?r= target', async () => {
    const { dispatched } = run('/', {
      ...baseState,
      dongleId: null,
      destinationKind: null,
      router: { location: { pathname: '/', search: `?r=%2F${OTHER}` } },
    });
    await Promise.resolve();
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${OTHER}` });
  });

  it('rejects an unsafe ?r= target', async () => {
    const { dispatched } = run('/', {
      ...baseState,
      dongleId: null,
      destinationKind: null,
      router: { location: { pathname: '/', search: '?r=//evil.example/foo' } },
    });
    await Promise.resolve();
    // Falls through to the remembered device, never the crafted target.
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${DONGLE}` });
    expect(dispatched.some((action) => action?.type === 'REPLACE' && action.pathname.includes('evil'))).toBe(false);
  });

  it('shows the demo device at /demo without changing the URL', async () => {
    const demo = { dongle_id: 'deadbeefdeadbeef', shared: true };
    const { dispatched } = run('/demo', {
      ...baseState, dongleId: null, destinationKind: null, devices: [demo], routes: null,
    });
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({ kind: 'dashboard', dongleId: demo.dongle_id });
    expect(replace).not.toHaveBeenCalled();
  });

  it('falls back to the no-device upsell when there are no devices', async () => {
    api.devices.listDevices.mockResolvedValue([]);
    const { dispatched, promise } = run('/', {
      ...baseState, dongleId: null, devices: null, device: null, destinationKind: null,
    });
    await promise;
    expect(destinations(dispatched)).toContainEqual({ kind: 'dashboard', dongleId: null });
  });

  it('loads startup data once and marks not-found for unknown paths', async () => {
    const { dispatched, promise } = run('/nonsense', {
      ...baseState, dongleId: null, devices: null, device: null, profile: null, destinationKind: null,
    });
    await promise;
    expect(api.account.getProfile).toHaveBeenCalledTimes(1);
    expect(dispatched).toContainEqual(expect.objectContaining({ type: Types.ACTION_STARTUP_DATA }));
    // The not-found page keeps the current device so cached data isn't evicted.
    expect(dispatched).toContainEqual(notFound(null));
  });

  it('applies a drive destination, resets playback, and starts its route load', async () => {
    const { dispatched } = run(`/${OTHER}/${LOG}/10/20`);
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({
      kind: 'drive', dongleId: OTHER, logId: LOG, start: 10000, end: 20000,
    });
    expect(resetPlayback).toHaveBeenCalled();
    expect(actions.checkRoutesData).toHaveBeenCalled();
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalled();
  });

  it('forces a route fetch when the drive is not among the loaded routes', async () => {
    const { promise } = run(`/${DONGLE}/${LOG}`, { ...baseState, routes: [{ log_id: 'other--log--id-0000' }] });
    await promise;
    expect(actions.checkRoutesData).toHaveBeenCalledWith({ force: true });
  });

  it('reloads the full list after a route-restricted load', async () => {
    const filter = { start: 100, end: 200 };
    const { promise } = run(`/${DONGLE}`, {
      ...baseState, destinationKind: 'dashboard', filter, routes: [{ log_id: LOG }], routesMeta: { routeOnly: true },
    });
    await promise;
    expect(actions.selectTimeFilter).toHaveBeenCalledWith(filter.start, filter.end);
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('selects Prime and fetches its subscription when the device changes', async () => {
    const { dispatched } = run(`/${OTHER}/prime`);
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({ kind: 'prime', dongleId: OTHER });
    expect(actions.primeFetchSubscription).toHaveBeenCalled();
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalled();
  });

  it('selects stream without starting route data', async () => {
    const { dispatched } = run(`/${OTHER}/stream`);
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({ kind: 'stream', dongleId: OTHER });
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('reconciles referrals as a destination and closes the previous view', async () => {
    const { dispatched } = run('/referrals', {
      ...baseState, destinationKind: 'stream', streamNav: true,
    });
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({ kind: 'referrals', dongleId: DONGLE });
  });

  it('applies referrals from a cold entry without a selected device', async () => {
    const { dispatched } = run('/referrals', {
      ...baseState, dongleId: null, destinationKind: null, device: null,
    });
    await Promise.resolve();
    expect(destinations(dispatched)).toContainEqual({ kind: 'referrals', dongleId: null });
  });

  it('does not re-apply referrals the store already matches', async () => {
    const { dispatched } = run('/referrals', {
      ...baseState, destinationKind: 'referrals',
    });
    await Promise.resolve();
    expect(destinations(dispatched)).toEqual([]);
  });

  it('migrates the draft-era settings path to the overlay form', async () => {
    const { dispatched } = run(`/${OTHER}/settings`);
    await Promise.resolve();
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${OTHER}?settings=${OTHER}` });
    expect(destinations(dispatched)).toEqual([]);
  });

  it('keeps a fetched shared device out of the owned list', async () => {
    api.devices.fetchDevice.mockResolvedValue({ dongle_id: UNKNOWN, shared: true });
    const { dispatched, promise } = run(`/${UNKNOWN}`);
    await promise;
    expect(api.devices.fetchDevice).toHaveBeenCalledWith(UNKNOWN);
    expect(dispatched).toContainEqual(expect.objectContaining({
      type: Types.ACTION_UPDATE_SHARED_DEVICE, dongleId: UNKNOWN,
    }));
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: Types.ACTION_UPDATE_DEVICE }));
    expect(actions.fetchDeviceOnline).not.toHaveBeenCalled();
  });

  it('reports a missing device', async () => {
    api.devices.fetchDevice.mockRejectedValue({ resp: { status: 404 } });
    const { dispatched, promise } = run(`/${UNKNOWN}`);
    await promise;
    expect(dispatched).toContainEqual(expect.objectContaining({
      type: Types.ACTION_DEVICE_NOT_FOUND, dongleId: UNKNOWN,
    }));
  });

  it('reports a missing device when the API resolves to null', async () => {
    // The request layer resolves to null on an error status; it only throws
    // for network-level failures.
    api.devices.fetchDevice.mockResolvedValue(null);
    const { dispatched, promise } = run(`/${UNKNOWN}`);
    await promise;
    expect(dispatched).toContainEqual(expect.objectContaining({
      type: Types.ACTION_DEVICE_NOT_FOUND, dongleId: UNKNOWN,
    }));
  });

  it('ignores a device lookup that fails after the user navigates away', async () => {
    let rejectDevice;
    api.devices.fetchDevice.mockReturnValue(new Promise((_resolve, reject) => { rejectDevice = reject; }));
    const { dispatched, promise, state } = run(`/${UNKNOWN}`);
    // The user moves on to another device while the lookup is in flight.
    state.router.location.pathname = `/${DONGLE}`;
    rejectDevice({ resp: { status: 404 } });
    await promise;
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: Types.ACTION_DEVICE_NOT_FOUND }));
    // ...and the success path is held to the same rule.
    expect(dispatched).not.toContainEqual(expect.objectContaining({ type: Types.ACTION_UPDATE_SHARED_DEVICE }));
  });

  it('a superseded run cannot mark a repeated navigation not-found', async () => {
    const rejects = [];
    api.devices.fetchDevice.mockImplementation(() => new Promise((_resolve, reject) => { rejects.push(reject); }));
    const first = run(`/${UNKNOWN}`);
    const second = run(`/${UNKNOWN}`); // same path, a newer navigation
    rejects[1]({ resp: { status: 404 } }); // the current lookup legitimately fails
    await second.promise;
    expect(second.dispatched).toContainEqual(expect.objectContaining({
      type: Types.ACTION_DEVICE_NOT_FOUND, dongleId: UNKNOWN,
    }));
    rejects[0]({ resp: { status: 404 } }); // the stale lookup fails late
    await first.promise;
    expect(first.dispatched).not.toContainEqual(expect.objectContaining({
      type: Types.ACTION_DEVICE_NOT_FOUND,
    }));
  });

  it('recovers with a normal destination after a failed lookup', async () => {
    api.devices.fetchDevice.mockRejectedValueOnce({ resp: { status: 404 } });
    const failed = run(`/${UNKNOWN}`);
    await failed.promise;
    const recovered = run(`/${OTHER}`, {
      ...failed.state,
      destinationKind: 'not-found',
      deviceNotFound: true,
      device: null,
    });
    await recovered.promise;
    expect(destinations(recovered.dispatched)).toContainEqual({ kind: 'dashboard', dongleId: OTHER });
    expect(recovered.dispatched).not.toContainEqual(expect.objectContaining({ type: Types.ACTION_DEVICE_NOT_FOUND }));
  });

  it.each([
    ['null', null],
    ['empty', []],
  ])('shows not-found after a %s legacy lookup', async (_name, routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const { dispatched, promise } = run(`/${DONGLE}/1000/2000`);
    await promise;
    expect(replace).not.toHaveBeenCalled();
    expect(dispatched).toContainEqual(notFound(DONGLE));
  });

  it('replaces a legacy range with its canonical drive URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { dispatched, promise } = run(`/${DONGLE}/1000/2000`);
    await promise;
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${DONGLE}/${LOG}` });
  });

  it('ignores a legacy lookup that resolves after the user navigates away', async () => {
    let resolveRoutes;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveRoutes = resolve; }));
    const { promise, state } = run(`/${DONGLE}/1000/2000`);
    state.router.location.pathname = `/${DONGLE}`;
    resolveRoutes([{ fullname: `${DONGLE}|${LOG}` }]);
    await promise;
    expect(replace).not.toHaveBeenCalled();
  });

  it('initializes the backend for the URL', async () => {
    run(`/${DONGLE}`);
    await Promise.resolve();
    expect(initBackend).toHaveBeenCalledWith(`/${DONGLE}`);
  });
});

describe('dialog overlay navigation', () => {
  const dispatchOver = (pathname, search, thunk, locationState) => {
    const dispatched = [];
    const getState = () => ({ router: { location: { pathname, search, state: locationState } } });
    const dispatch = vi.fn((action) => {
      if (typeof action === 'function') {
        return action(dispatch, getState);
      }
      dispatched.push(action);
      return action;
    });
    dispatch(thunk);
    return dispatched;
  };

  it('openOverlay pushes the current page with the overlay parameter', () => {
    const dispatched = dispatchOver(`/${DONGLE}`, '', openOverlay({ kind: 'settings', dongleId: OTHER }));
    expect(dispatched).toEqual([{
      type: 'PUSH',
      pathname: `/${DONGLE}`,
      state: { overlayOpenedInApp: true },
      search: `?settings=${OTHER}`,
    }]);
  });

  it('openOverlay keeps other parameters and replaces its own', () => {
    const dispatched = dispatchOver(
      `/${DONGLE}/${LOG}`, `?settings=${OTHER}`, openOverlay({ kind: 'dates' }),
    );
    expect(dispatched).toEqual([expect.objectContaining({
      type: 'PUSH',
      search: '?dates=1',
      state: { overlayOpenedInApp: true },
    })]);
  });

  it('openOverlay is a no-op when that overlay is already open', () => {
    const dispatched = dispatchOver(
      `/${DONGLE}`, `?settings=${OTHER}`, openOverlay({ kind: 'settings', dongleId: OTHER }),
    );
    expect(dispatched).toEqual([]);
  });

  it('closeOverlay goes back over an overlay opened in-app', () => {
    const dispatched = dispatchOver(`/${DONGLE}`, `?settings=${OTHER}`, closeOverlay(), { overlayOpenedInApp: true });
    expect(dispatched).toEqual([{ type: 'GO_BACK' }]);
  });

  it('closeOverlay replaces a cold-loaded overlay in place', () => {
    const dispatched = dispatchOver(`/${DONGLE}`, `?settings=${OTHER}&keep=1`, closeOverlay());
    expect(dispatched).toEqual([{ type: 'REPLACE', pathname: `/${DONGLE}?keep=1` }]);
  });

  it('closeOverlay is a no-op without an overlay', () => {
    const dispatched = dispatchOver(`/${DONGLE}`, '', closeOverlay());
    expect(dispatched).toEqual([]);
  });
});
