import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import MyCommaAuth from '@commaai/my-comma-auth';
import { account as Account, drives as Drives, devices as Devices } from '../api';
import { webrtcConnectionManager } from '../utils/webrtc';
import * as Types from './types';
import { onHistoryMiddleware, syncStateFromUrl } from './history';
import * as actions from './index';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: vi.fn(() => false) } }));
vi.mock('../api', () => ({
  account: { getProfile: vi.fn() },
  devices: { listDevices: vi.fn(), fetchDevice: vi.fn() },
  drives: { getRoutesSegments: vi.fn() },
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
const NOT_FOUND_DESTINATION = { dongleId: null, page: 'dashboard', drive: null };

const baseState = {
  dongleId: DONGLE,
  device: { dongle_id: DONGLE },
  devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
  profile: null,
  routes: [],
  segmentRange: null,
  primeNav: false,
  streamNav: false,
};

function run(url, state = baseState) {
  window.history.replaceState({}, '', url);
  const { pathname } = window.location;
  const dispatched = [];
  const dispatch = vi.fn((action) => {
    dispatched.push(action);
    return typeof action === 'function' ? action(dispatch, () => state) : action;
  });
  return { dispatched, dispatch, promise: dispatch(syncStateFromUrl(pathname)) };
}

async function dispatchedFor(url, state) {
  const { dispatched, promise } = run(url, state);
  await promise;
  return dispatched;
}

const expectDestination = (dispatched, destination) => expect(dispatched).toContainEqual({
  type: Types.ACTION_APPLY_DESTINATION,
  destination,
});

beforeEach(() => {
  vi.clearAllMocks();
  MyCommaAuth.isAuthenticated.mockReturnValue(true);
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
    MyCommaAuth.isAuthenticated.mockReturnValue(false);
    const signedOutState = { ...baseState, devices: null };
    await dispatchedFor(`/${DONGLE}`, signedOutState);

    expect(Account.getProfile).not.toHaveBeenCalled();
    expect(Devices.listDevices).not.toHaveBeenCalled();
    expect(Devices.fetchDevice).not.toHaveBeenCalled();
    expect(actions.fetchDeviceOnline).not.toHaveBeenCalled();
  });

  it('atomically selects a drive and starts its route load', async () => {
    const dispatched = await dispatchedFor(`/${OTHER}/${LOG}/10/20`);

    expect(dispatched).toContainEqual({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: OTHER,
        page: 'drive',
        drive: { logId: LOG, start: 10000, end: 20000 },
      },
    });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it.each([
    ['disconnects', OTHER, 1],
    ['keeps the connection', DONGLE, 0],
  ])('%s WebRTC when navigating to %s', async (_behavior, dongleId, calls) => {
    await dispatchedFor(`/${dongleId}`);
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledTimes(calls);
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
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatched = await dispatchedFor(`/${DONGLE}/1000/2000`);

    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`);
    expect(dispatched).toContainEqual({ type: 'REPLACE', pathname: `/${DONGLE}/${LOG}` });
  });

  it.each([
    ['null', () => Drives.getRoutesSegments.mockResolvedValue(null)],
    ['empty', () => Drives.getRoutesSegments.mockResolvedValue([])],
    ['rejected', () => Drives.getRoutesSegments.mockRejectedValue(new Error('request failed'))],
  ])('shows not found after a %s legacy lookup', async (_outcome, arrangeLookup) => {
    arrangeLookup();
    const dispatched = await dispatchedFor(`/${DONGLE}/1000/2000`);
    expect(replace).not.toHaveBeenCalled();
    expectDestination(dispatched, NOT_FOUND_DESTINATION);
  });

  it('ignores a legacy lookup after navigation moves elsewhere', async () => {
    let resolveRoutes;
    Drives.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveRoutes = resolve; }));
    const pathname = `/${DONGLE}/1000/2000`;
    const { promise } = run(pathname);
    window.history.replaceState({}, '', `/${DONGLE}`);
    resolveRoutes([{ fullname: `${DONGLE}|${LOG}` }]);
    await promise;
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid route', '/invalid', null, { type: Types.ACTION_APPLY_DESTINATION, destination: NOT_FOUND_DESTINATION }],
    ['a missing device', `/${UNKNOWN}`, () => Devices.fetchDevice.mockRejectedValue({ resp: { status: 404 } }), { type: Types.ACTION_DEVICE_NOT_FOUND }],
  ])('handles %s', async (_outcome, url, arrange, expectedAction) => {
    arrange?.();
    const dispatched = await dispatchedFor(url);

    expect(dispatched).toContainEqual(expectedAction);
  });
});
