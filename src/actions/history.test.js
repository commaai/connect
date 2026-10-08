import { vi } from 'vitest';
import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { navigate, onHistoryMiddleware, reconcile } from './history';
import { ACTION_STARTUP_DATA } from './types';

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../api/backend', () => ({
  api: { auth: { isAuthenticated: () => auth.signedIn }, routes: { getRoutesSegments: vi.fn() } },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('./index', () => ({
  checkRoutesData: () => ({ type: 'checkRoutesData' }),
  fetchDeviceOnline: (dongleId) => ({ type: 'fetchDeviceOnline', dongleId }),
  fetchSharedDevice: (dongleId) => ({ type: 'fetchSharedDevice', dongleId }),
  primeFetchSubscription: (dongleId) => ({ type: 'primeFetchSubscription', dongleId }),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const SHARED = '2222cccc2222cccc';
const LOG = '2026-08-06--12-00-00';
const devices = [{ dongle_id: DONGLE, is_owner: true }, { dongle_id: OTHER, is_owner: true }];

function state(pathname, fields = {}) {
  const dongleId = pathname.split('/')[1] || null;
  return { router: { location: { pathname, search: '', hash: '' } }, devices, profile: { id: 'me' }, dongleId, ...fields };
}

function fakeStore(initial) {
  let current = initial;
  const actions = [];
  const getState = () => current;
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, getState) : actions.push(action));
  return { actions, dispatch, getState, moveTo: (pathname) => { current = state(pathname); } };
}

function run(prev, next) {
  const store = fakeStore(next);
  return { ...store, result: reconcile(prev)(store.dispatch, store.getState) };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.signedIn = true;
});

describe('reconcile', () => {
  it('waits for startup data when signed out', () => {
    auth.signedIn = false;
    const { actions } = run(state('/'), state(`/${DONGLE}`, { devices: null }));
    expect(actions).toEqual([]);
  });

  it.each([
    ['a public drive', `/${DONGLE}/${LOG}`, false],
    ['a signed-in dashboard', `/${DONGLE}`, true],
  ])('loads routes for %s without waiting for startup data', (_name, pathname, signedIn) => {
    auth.signedIn = signedIn;
    const { actions } = run(state('/'), state(pathname, { devices: null }));
    expect(actions).toEqual([{ type: 'checkRoutesData' }]);
  });

  it('resolves home to the remembered device, keeping the query and hash', () => {
    localStorage.setItem('selectedDongleId', OTHER);
    const home = state('/', { router: { location: { pathname: '/', search: '?modal=pair', hash: '#top' } } });
    const { actions } = run(state('/', { devices: null }), home);
    expect(actions).toEqual([replace({ pathname: `/${OTHER}`, search: '?modal=pair', hash: '#top' })]);
  });

  it('resolves home to the return path', () => {
    const home = state('/', { router: { location: { pathname: '/', search: `?r=%2F${DONGLE}%2Fprime`, hash: '' } } });
    const { actions } = run(state('/'), home);
    expect(actions).toEqual([replace(`/${DONGLE}/prime`)]);
  });

  it('tears down the old device\'s connection before resolving home', () => {
    const { actions } = run(state(`/${DONGLE}/stream`), state('/'));
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(actions).toEqual([replace({ pathname: `/${DONGLE}`, search: '', hash: '' })]);
  });

  it('stays home without devices', () => {
    const { actions } = run(state('/', { devices: null }), state('/', { devices: [] }));
    expect(actions).toEqual([]);
  });

  it('loads the device once startup data arrives', () => {
    const { actions } = run(state(`/${DONGLE}`, { devices: null }), state(`/${DONGLE}`));
    expect(actions).toEqual([{ type: 'primeFetchSubscription', dongleId: DONGLE }, { type: 'checkRoutesData' }]);
    expect(localStorage.getItem('selectedDongleId')).toBe(DONGLE);
  });

  it('switches devices', () => {
    const { actions } = run(state(`/${DONGLE}/${LOG}`), state(`/${OTHER}`));
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(actions).toEqual([
      { type: 'primeFetchSubscription', dongleId: OTHER },
      { type: 'fetchDeviceOnline', dongleId: OTHER },
      { type: 'checkRoutesData' },
    ]);
  });

  it('fetches a device that is not in the device list', () => {
    const { actions } = run(state(`/${DONGLE}`), state(`/${SHARED}`));
    expect(actions).toEqual([{ type: 'fetchSharedDevice', dongleId: SHARED }, { type: 'checkRoutesData' }]);
  });

  it('only checks routes when the device is unchanged', () => {
    const { actions } = run(state(`/${DONGLE}`), state(`/${DONGLE}/${LOG}`));
    expect(webrtcConnectionManager.disconnect).not.toHaveBeenCalled();
    expect(actions).toEqual([{ type: 'checkRoutesData' }]);
  });

  it('replaces a legacy timestamp link with its drive, keeping the query and hash', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const legacy = state(`/${DONGLE}/1000/2000`, { router: { location: { pathname: `/${DONGLE}/1000/2000`, search: '?ci=1', hash: '#top' } } });
    const { actions, result } = run(state(`/${DONGLE}`), legacy);
    await vi.waitFor(() => expect(actions).toContainEqual(replace({ pathname: `/${DONGLE}/${LOG}`, search: '?ci=1', hash: '#top' })));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(result).toBeUndefined();
  });

  it('looks up a legacy link once per visit', () => {
    api.routes.getRoutesSegments.mockResolvedValue([]);
    const legacy = `/${DONGLE}/1000/2000`;
    run(state(legacy), state(legacy));
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('ignores a legacy lookup that finishes after the user moved on', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { actions, moveTo } = run(state(`/${DONGLE}`), state(`/${DONGLE}/1000/2000`));
    moveTo(`/${OTHER}`);
    resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(actions).toEqual([{ type: 'checkRoutesData' }]);
  });

  it.each([['empty', () => Promise.resolve([])], ['failed', () => Promise.reject(new Error('lookup failed'))]])('keeps a legacy link after an %s lookup', async (_name, lookup) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.routes.getRoutesSegments.mockImplementation(lookup);
    const { actions } = run(state(`/${DONGLE}`), state(`/${DONGLE}/1000/2000`));
    await new Promise((r) => setTimeout(r, 0));
    expect(actions).toEqual([{ type: 'checkRoutesData' }]);
  });
});

describe('navigate', () => {
  const dashboard = { page: 'dashboard', dongleId: DONGLE };
  const drive = { page: 'drive', dongleId: DONGLE, logId: LOG };
  const ranged = { ...drive, range: { start: 10000, end: 20000 } };

  it.each([
    ['another device', `/${DONGLE}`, { page: 'dashboard', dongleId: OTHER }, `/${OTHER}`],
    ['a drive', `/${DONGLE}`, drive, `/${DONGLE}/${LOG}`],
    ['a range of the drive', `/${DONGLE}/${LOG}`, ranged, `/${DONGLE}/${LOG}/10/20`],
    ['the whole drive', `/${DONGLE}/${LOG}/10/20`, drive, `/${DONGLE}/${LOG}`],
  ])('pushes %s', (_name, pathname, nav, url) => {
    const { actions, dispatch, getState } = fakeStore(state(pathname));
    navigate(nav)(dispatch, getState);
    expect(actions).toEqual([push(url)]);
  });

  it.each([
    ['a dashboard', `/${DONGLE}`, dashboard],
    ['a whole drive', `/${DONGLE}/${LOG}`, drive],
    ['a ranged drive', `/${DONGLE}/${LOG}/10/20`, ranged],
  ])('does not push %s that is already showing', (_name, pathname, nav) => {
    const { actions, dispatch, getState } = fakeStore(state(pathname));
    navigate(nav)(dispatch, getState);
    expect(actions).toEqual([]);
  });
});

describe('history middleware', () => {
  it.each([LOCATION_CHANGE, ACTION_STARTUP_DATA])('reconciles after %s with the state from before it', (type) => {
    const { actions, dispatch, getState } = fakeStore(state(`/${DONGLE}`));
    const before = state(`/${DONGLE}`, { devices: null });
    const next = vi.fn();
    onHistoryMiddleware({ dispatch, getState: vi.fn().mockReturnValueOnce(before).mockImplementation(getState) })(next)({ type });
    expect(next).toHaveBeenCalledWith({ type });
    expect(actions).toEqual([{ type: 'primeFetchSubscription', dongleId: DONGLE }, { type: 'checkRoutesData' }]);
  });

  it('passes other actions through', () => {
    const dispatch = vi.fn();
    const next = vi.fn();
    onHistoryMiddleware({ dispatch, getState: () => state('/') })(next)({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
