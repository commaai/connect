import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import globalState from '../reducers/globalState';
import { webrtcConnectionManager } from '../utils/webrtc';
import { navigateTo, onHistoryMiddleware, syncStateFromUrl } from './history';
import { ACTION_STARTUP_DATA } from './types';

vi.mock('../api/backend', () => ({ api: { auth: { isAuthenticated: () => true }, routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../timeline', () => ({ currentOffset: vi.fn() })); // keeps the store out of this test
vi.mock('./index', () => Object.fromEntries(
  ['checkRoutesData', 'checkLastRoutesData', 'fetchDeviceOnline', 'fetchSharedDevice', 'primeFetchSubscription']
    .map((name) => [name, () => ({ type: name })]),
));

const OWNED = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';

// a store running the real reducer, recording every plain action
function createStore(pathname, overrides = {}) {
  let state = {
    ...createInitialState(),
    devices: [{ dongle_id: OTHER, is_owner: true }, { dongle_id: OWNED, is_owner: true }],
    profile: {},
    routes: [{ log_id: LOG, duration: 60000 }],
    router: { location: { pathname, search: '?pair=x' } },
    ...overrides,
  };
  const actions = [];
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, () => state);
    actions.push(action);
    state = globalState(state, action);
    return action;
  };
  const navigate = (to) => {
    state = { ...state, router: { location: { pathname: to, search: '' } } };
    return dispatch(syncStateFromUrl());
  };
  return { dispatch, actions, navigate, getState: () => state };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('onHistoryMiddleware', () => {
  it.each([
    ['a PUSH to a new path', { type: LOCATION_CHANGE, payload: { location: { pathname: `/${OTHER}` } } }, true],
    ['startup data', { type: ACTION_STARTUP_DATA, devices: [] }, true],
    ['a change to the same path', { type: LOCATION_CHANGE, payload: { location: { pathname: `/${OWNED}` } } }, false],
    ['an unrelated action', { type: 'OTHER' }, false],
  ])('after %s, syncs: %s', (_name, action, synced) => {
    const store = { getState: () => ({ router: { location: { pathname: `/${OWNED}` } } }), dispatch: vi.fn() };
    const next = vi.fn();
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch.mock.calls.length > 0).toBe(synced);
  });
});

describe('syncStateFromUrl', () => {
  it('waits for startup data', async () => {
    const { dispatch, actions } = createStore('/', { devices: null });
    await dispatch(syncStateFromUrl());
    expect(actions).toEqual([]);
  });

  it.each([
    ['/', undefined, `/${OWNED}`],
    ['/', OTHER, `/${OTHER}`],
    ['/nope', undefined, `/${OWNED}`],
    [`/${OWNED}/${LOG}/20/10`, undefined, `/${OWNED}/${LOG}`],
  ])('normalizes %s (remembered %s) to %s', async (pathname, remembered, expected) => {
    if (remembered) localStorage.setItem('selectedDongleId', remembered);
    const { dispatch, actions } = createStore(pathname);
    await dispatch(syncStateFromUrl(OWNED));
    expect(actions).toEqual([replace({ pathname: expected, search: '?pair=x' })]);
  });

  it('resolves a legacy URL, unless navigation moved on meanwhile', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${OWNED}|${LOG}` }]);
    const resolved = createStore(`/${OWNED}/10/20`);
    await resolved.dispatch(syncStateFromUrl());
    expect(resolved.actions).toEqual([replace({ pathname: `/${OWNED}/${LOG}`, search: '?pair=x' })]);

    const stale = createStore(`/${OWNED}/10/20`);
    const pending = stale.dispatch(syncStateFromUrl());
    await stale.navigate(`/${OTHER}`);
    await pending;
    expect(stale.actions.some((a) => a.payload?.method === 'replace')).toBe(false);
  });

  it('loads a device once, reuses it within the device, and tears it down on switch', async () => {
    const { dispatch, actions, navigate, getState } = createStore(`/${OWNED}`);
    const sideEffects = () => actions.map((a) => a.type).filter((type) => !type.startsWith('ACTION_'));
    await dispatch(syncStateFromUrl());
    expect(sideEffects()).toEqual(['primeFetchSubscription', 'fetchDeviceOnline', 'checkLastRoutesData']);
    expect(localStorage.getItem('selectedDongleId')).toBe(OWNED);

    actions.length = 0;
    await navigate(`/${OWNED}/${LOG}`);
    await navigate(`/${OWNED}/prime`);
    expect(sideEffects()).toEqual(['checkRoutesData']);
    expect(webrtcConnectionManager.disconnect).not.toHaveBeenCalled();

    await navigate(`/${OTHER}`);
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledTimes(1);
    expect(getState().dongleId).toBe(OTHER);
  });
});

describe('navigateTo', () => {
  it.each([
    [{}, `/${OWNED}/prime`, `/${OWNED}`],
    [{ page: 'settings', dongleId: OTHER }, `/${OWNED}`, `/${OTHER}/settings`],
    [{ page: 'referrals' }, `/${OWNED}`, '/referrals'],
    [{ logId: LOG, range: { start: 0, end: 20000 } }, `/${OWNED}`, `/${OWNED}/${LOG}/0/20`],
    [{ logId: LOG, range: { start: 0, end: 60000 } }, `/${OWNED}`, `/${OWNED}/${LOG}`],
    [{ logId: LOG }, `/${OWNED}/${LOG}`, null],
  ])('%o from %s pushes %s', (destination, from, to) => {
    const { dispatch, actions } = createStore(from, { dongleId: OWNED });
    dispatch(navigateTo(destination));
    expect(actions).toEqual(to ? [push(to)] : []);
  });
});
