import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { DEMO_DONGLE_ID } from '../api/demo';
import { onHistoryMiddleware, syncStateFromUrl } from './history';
import * as Types from './types';

vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

vi.mock('../api', () => ({
  athena: {}, billing: {}, request: {}, account: {}, devices: {}, drives: {}, raw: {}, video: {},
}));

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn(() => true), logOut: vi.fn() },
    account: { getProfile: vi.fn(async () => ({ id: 'u' })) },
    devices: {
      listDevices: vi.fn(async () => [{ dongle_id: '0000aaaa0000aaaa', alias: 'one', is_owner: true }]),
      fetchDevice: vi.fn(async () => ({ dongle_id: 'cccccccccccccccc', alias: 'shared' })),
    },
    routes: { getRoutesSegments: vi.fn(async () => []) },
  },
}));

vi.mock('./index', () => ({
  checkRoutesData: vi.fn(() => ({ type: 'CHECK_ROUTES' })),
  checkLastRoutesData: vi.fn(() => ({ type: 'CHECK_LAST_ROUTES' })),
  fetchDeviceOnline: vi.fn(() => ({ type: 'FETCH_ONLINE' })),
  primeFetchSubscription: vi.fn(() => ({ type: 'PRIME_SUB' })),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const SHARED = 'cccccccccccccccc';
const LOG = '2026-08-06--12-00-00';

const baseState = {
  dongleId: null, devices: [], profile: null,
  urlRange: null, primeNav: false, streamNav: false,
  referralsNav: false, modal: null, routes: null,
  router: { location: { pathname: '/' } },
};

function invoke(pathname, state = baseState, action = 'POP') {
  const store = {
    getState: vi.fn(() => ({ ...state, router: { location: { pathname } } })),
    dispatch: vi.fn((a) => (typeof a === 'function' ? a(store.dispatch, store.getState) : a)),
  };
  const next = vi.fn();
  onHistoryMiddleware(store)(next)({
    type: LOCATION_CHANGE,
    payload: { action, location: { pathname } },
  });
  return store;
}

beforeEach(() => vi.clearAllMocks());

describe('history middleware', () => {
  it('passes non-location actions through untouched', () => {
    const store = { getState: vi.fn(() => baseState), dispatch: vi.fn() };
    const next = vi.fn();
    onHistoryMiddleware(store)(next)({ type: 'OTHER' });
    expect(next).toHaveBeenCalledWith({ type: 'OTHER' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('syncs state on %s', async (historyAction) => {
    const store = invoke(`/${DONGLE}`, { ...baseState, devices: baseState.devices }, historyAction);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: { dongleId: DONGLE, page: 'dashboard', drive: null },
    })));
  });
});

describe('syncStateFromUrl', () => {
  const run = async (loc, state = baseState) => {
    const location = typeof loc === 'string' ? { pathname: loc } : loc;
    const store = {
      getState: vi.fn(() => ({ ...state, router: { location } })),
      dispatch: vi.fn((a) => (typeof a === 'function' ? a(store.dispatch, store.getState) : a)),
    };
    await syncStateFromUrl(location)(store.dispatch, store.getState);
    return store;
  };

  it('redirects / to the remembered or first device', async () => {
    window.localStorage.setItem('selectedDongleId', DONGLE);
    const store = await run('/', { ...baseState, devices: [{ dongle_id: DONGLE }] });
    expect(store.dispatch).toHaveBeenCalledWith(replace({ pathname: `/${DONGLE}` }));
    window.localStorage.clear();
  });

  it('carries query and hash through the root redirect', async () => {
    const store = await run(
      { pathname: '/', search: '?modal=settings', hash: '#x' },
      { ...baseState, devices: [{ dongle_id: DONGLE }] },
    );
    expect(store.dispatch).toHaveBeenCalledWith(
      replace({ pathname: `/${DONGLE}`, search: '?modal=settings', hash: '#x' }),
    );
  });

  it('fetches an unknown device directly (shared device deep link)', async () => {
    const store = await run(`/${SHARED}`, { ...baseState, devices: [{ dongle_id: DONGLE }] });
    expect(api.devices.fetchDevice).toHaveBeenCalledWith(SHARED);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: { dongleId: SHARED, page: 'dashboard', drive: null },
    })));
  });

  it('maps a drive URL to a drive destination', async () => {
    const store = await run(`/${DONGLE}/${LOG}/10/20`, { ...baseState, devices: [{ dongle_id: DONGLE }] });
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: { dongleId: DONGLE, page: 'drive', drive: { logId: LOG, start: 10000, end: 20000 } },
    })));
  });

  it('maps a demo drive URL onto the demo dongle', async () => {
    const store = await run(`/demo/${LOG}`, { ...baseState, devices: [{ dongle_id: DONGLE }] });
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: { dongleId: DEMO_DONGLE_ID, page: 'drive', drive: { logId: LOG, start: null, end: null } },
    })));
  });

  it('canonicalizes /settings to ?modal=settings', async () => {
    const store = await run(`/${DONGLE}/settings`, { ...baseState, devices: [{ dongle_id: DONGLE }] });
    expect(store.dispatch).toHaveBeenCalledWith(
      replace({ pathname: `/${DONGLE}`, search: '?modal=settings', hash: undefined }),
    );
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
    }));
  });

  it('applies a settings modal from the query string', async () => {
    const store = await run(
      { pathname: `/${DONGLE}/${LOG}`, search: '?modal=settings' },
      { ...baseState, devices: [{ dongle_id: DONGLE }] },
    );
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: DONGLE,
        page: 'drive',
        drive: { logId: LOG, start: null, end: null },
        modal: 'settings',
        modalDevice: DONGLE,
      },
    })));
  });

  it('does not touch state for auth callbacks', async () => {
    const store = await run('/auth/google', { ...baseState, devices: [{ dongle_id: DONGLE }] });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('converts a legacy range URL to the canonical route URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValueOnce([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = await run(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(
      replace({ pathname: `/${DONGLE}/${LOG}`, search: undefined, hash: undefined }),
    ));
  });

  it('preserves a legacy sub-range losslessly in the canonical route URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValueOnce([{
      fullname: `${DONGLE}|${LOG}`,
      start_time_utc_millis: 0,
      duration: 60000,
    }]);
    const store = await run(`/${DONGLE}/10500/20900`);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(
      replace({ pathname: `/${DONGLE}/${LOG}/10.5/20.9`, search: undefined, hash: undefined }),
    ));
  });

  it('abandons a sync superseded by a newer navigation', async () => {
    const store = {
      getState: vi.fn(() => ({ ...baseState, router: { location: { pathname: '/elsewhere' } } })),
      dispatch: vi.fn((a) => (typeof a === 'function' ? a(store.dispatch, store.getState) : a)),
    };
    await syncStateFromUrl(`/${DONGLE}`)(store.dispatch, store.getState);
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
    }));
  });

  it('flags a missing device', async () => {
    api.devices.fetchDevice.mockRejectedValueOnce({ resp: { status: 404 } });
    const store = await run(`/${OTHER}`, { ...baseState, devices: [{ dongle_id: DONGLE }] });
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_DEVICE_NOT_FOUND }));
  });

  it('does not re-apply a destination that already matches state', async () => {
    const matching = {
      ...baseState,
      dongleId: DONGLE,
      devices: [{ dongle_id: DONGLE }],
      urlRange: { logId: LOG, start: 10000, end: 20000 },
    };
    const store = await run(`/${DONGLE}/${LOG}/10/20`, matching);
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      type: Types.ACTION_APPLY_DESTINATION,
    }));
  });
});
