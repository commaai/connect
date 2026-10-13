import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import { onHistoryMiddleware, syncStateFromUrl } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn(() => false) },
    account: { getProfile: vi.fn() },
    devices: { listDevices: vi.fn(), fetchDevice: vi.fn() },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));
vi.mock('./index', () => ({
  checkRoutesData: vi.fn(() => ({ type: 'CHECK_ROUTES' })),
  checkLastRoutesData: vi.fn(() => ({ type: 'CHECK_LAST_ROUTES' })),
  fetchDeviceOnline: vi.fn((dongleId) => ({ type: 'FETCH_ONLINE', dongleId })),
  primeFetchSubscription: vi.fn((dongleId) => ({ type: 'FETCH_SUBSCRIPTION', dongleId })),
}));
vi.mock('connected-react-router', async () => {
  const original = await vi.importActual('connected-react-router');
  return { ...original, push: vi.fn((pathname) => ({ type: 'PUSH', pathname })), replace: vi.fn((pathname) => ({ type: 'REPLACE', pathname })) };
});

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const UNKNOWN = '2222cccc2222cccc';
const LOG = '2026-08-06--12-00-00';
const NOT_FOUND_DESTINATION = { dongleId: null, page: 'not-found', drive: null };

const baseState = {
  dongleId: DONGLE,
  device: { dongle_id: DONGLE },
  devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
  profile: null,
  routes: [],
  selectedRouteId: null,
  zoom: null,
  page: 'dashboard',
};

function run(url, state = baseState) {
  window.history.replaceState({}, '', url);
  const { pathname } = window.location;
  const dispatched = [];
  const dispatch = vi.fn((action) => {
    dispatched.push(action);
    if (action.type === Types.ACTION_APPLY_DESTINATION) state = { ...state, dongleId: action.destination.dongleId };
    return typeof action === 'function' ? action(dispatch, () => ({ ...state, router: { location: window.location } })) : action;
  });
  return { dispatched, dispatch, promise: dispatch(syncStateFromUrl(pathname)) };
}

async function dispatchedFor(url, state) {
  const { dispatched, promise } = run(url, state);
  await promise;
  await new Promise((resolve) => { setTimeout(resolve, 0); }); // the device loads after its page
  return dispatched;
}

const expectDestination = (dispatched, destination) => expect(dispatched).toContainEqual({
  type: Types.ACTION_APPLY_DESTINATION,
  destination,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.auth.isAuthenticated.mockReturnValue(true);
  window.localStorage.clear();
});

describe('history middleware', () => {
  it('passes every action through and synchronizes every location change', () => {
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    const next = vi.fn(() => 'result');
    const action = { type: LOCATION_CHANGE, payload: { location: { pathname: `/${DONGLE}` }, action: 'PUSH' } };

    expect(onHistoryMiddleware(store)(next)(action)).toBe('result');
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('ignores an absent action', () => {
    const next = vi.fn();
    expect(onHistoryMiddleware({ dispatch: vi.fn(), getState: vi.fn() })(next)()).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('syncStateFromUrl', () => {
  it('does not request private data for a signed-out private route', async () => {
    api.auth.isAuthenticated.mockReturnValue(false);
    const signedOutState = { ...baseState, devices: null };
    await dispatchedFor(`/${DONGLE}`, signedOutState);

    expect(api.account.getProfile).not.toHaveBeenCalled();
    expect(api.devices.listDevices).not.toHaveBeenCalled();
    expect(api.devices.fetchDevice).not.toHaveBeenCalled();
    expect(actions.fetchDeviceOnline).not.toHaveBeenCalled();
  });

  it('atomically selects a drive and starts its route load', async () => {
    const dispatched = await dispatchedFor(`/${OTHER}/${LOG}/10/20`);

    expectDestination(dispatched, { dongleId: OTHER, page: 'drive', drive: { logId: LOG, start: 10000, end: 20000 } });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it.each([
    ['disconnects WebRTC and refreshes the device', OTHER, 1],
    ['keeps the WebRTC connection and the device', DONGLE, 0],
  ])('%s when navigating to %s', async (_behavior, dongleId, calls) => {
    await dispatchedFor(`/${dongleId}`);
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledTimes(calls);
    expect(actions.fetchDeviceOnline).toHaveBeenCalledTimes(calls);
  });

  it.each([
    ['Prime', 'prime', 'FETCH_SUBSCRIPTION'],
    ['stream', 'stream', 'FETCH_ONLINE'],
    ['dashboard', 'dashboard', 'CHECK_LAST_ROUTES'],
  ])('selects the %s destination and starts branch data', async (_name, page, fetchType) => {
    const suffix = page === 'dashboard' ? '' : `/${page}`;
    const dispatched = await dispatchedFor(`/${OTHER}${suffix}`);

    expectDestination(dispatched, { dongleId: OTHER, page, drive: null });
    expect(dispatched).toContainEqual(expect.objectContaining({ type: fetchType }));
  });

  it('preserves Stripe Checkout return parameters on the Prime route', async () => {
    const sessionId = 'cs_test_123';
    const dispatched = await dispatchedFor(`/${OTHER}/prime?stripe_success=${sessionId}`);

    expectDestination(dispatched, { dongleId: OTHER, page: 'prime', drive: null });
    expect(window.location.search).toBe(`?stripe_success=${sessionId}`);
  });

  it('converts a legacy timestamp range to the canonical drive URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatched = await dispatchedFor(`/${DONGLE}/1000/2000`);

    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`);
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${DONGLE}/${LOG}` });
  });

  it.each([
    ['null', () => api.routes.getRoutesSegments.mockResolvedValue(null)],
    ['empty', () => api.routes.getRoutesSegments.mockResolvedValue([])],
    ['rejected', () => api.routes.getRoutesSegments.mockRejectedValue(new Error('request failed'))],
  ])('shows not found after a %s legacy lookup', async (_outcome, arrangeLookup) => {
    arrangeLookup();
    const dispatched = await dispatchedFor(`/${DONGLE}/1000/2000`);
    expect(replace).not.toHaveBeenCalled();
    expectDestination(dispatched, { dongleId: DONGLE, page: 'not-found', drive: null });
  });

  it('ignores a legacy lookup after navigation moves elsewhere', async () => {
    let resolveRoutes;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveRoutes = resolve; }));
    const pathname = `/${DONGLE}/1000/2000`;
    const { promise } = run(pathname);
    window.history.replaceState({}, '', `/${DONGLE}`);
    resolveRoutes([{ fullname: `${DONGLE}|${LOG}` }]);
    await promise;
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid route', '/invalid', null, { type: Types.ACTION_APPLY_DESTINATION, destination: NOT_FOUND_DESTINATION }],
    ['a missing device', `/${UNKNOWN}`, () => api.devices.fetchDevice.mockRejectedValue({ resp: { status: 404 } }), { type: Types.ACTION_DEVICE_NOT_FOUND }],
  ])('handles %s', async (_outcome, url, arrange, expectedAction) => {
    arrange?.();
    const dispatched = await dispatchedFor(url);

    expect(dispatched).toContainEqual(expectedAction);
  });
});
