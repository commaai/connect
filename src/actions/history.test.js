import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { drives as Drives } from '../api';
import { hydrateDevice, onHistoryMiddleware, syncStateFromUrl } from './history';
import { createInitialState } from '../initialState';
import reducer from '../reducers/globalState';
import { ACTION_APPLY_DESTINATION, ACTION_STARTUP_DATA, ACTION_UPDATE_DEVICE_ONLINE } from './types';
import { webrtcConnectionManager } from '../utils/webrtc';

vi.mock('../api', () => ({
  account: {}, auth: {}, billing: {}, devices: {},
  drives: { getRoutesSegments: vi.fn() }, raw: {}, video: {},
}));
vi.mock('./index', () => ({
  checkRoutesData: () => ({ type: 'checkRoutesData' }),
  checkLastRoutesData: () => ({ type: 'checkLastRoutesData' }),
  primeFetchSubscription: (...args) => ({ type: 'primeFetchSubscription', args }),
  fetchDeviceOnline: (...args) => ({ type: 'fetchDeviceOnline', args }),
  fetchSharedDevice: (...args) => ({ type: 'fetchSharedDevice', args }),
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../timeline', () => ({ currentOffset: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
function create(extra = {}) {
  let state = { ...createInitialState('/'), ...extra };
  const dispatch = vi.fn((action) => {
    if (typeof action === 'function') return action(dispatch, () => state);
    if (action.type === LOCATION_CHANGE) state.router = { location: action.payload.location };
    state = reducer(state, action);
    return action;
  });
  return { dispatch, getState: () => state };
}
const replacement = (path) => expect.objectContaining({ payload: { method: 'replace', args: [path] } });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('URL synchronization', () => {
  it.each(['PUSH', 'POP', 'REPLACE'])('updates the router before syncing %s', (action) => {
    const store = create();
    const next = vi.fn();
    const location = { type: LOCATION_CHANGE, payload: { action, location: { pathname: `/${DONGLE}` } } };
    onHistoryMiddleware(store)(next)(location);
    expect(next).toHaveBeenCalledWith(location);
    expect(next.mock.invocationCallOrder[0]).toBeLessThan(store.dispatch.mock.invocationCallOrder[0]);
    expect(store.getState().dongleId).toBe(DONGLE);
  });

  it('passes other actions through', () => {
    const store = create();
    const next = vi.fn();
    const action = { type: 'TEST' };
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each([DONGLE, 'unknown', null])('root selects remembered or first device (%s)', (remembered) => {
    if (remembered) localStorage.setItem('selectedDongleId', remembered);
    const store = create({ devices: [{ dongle_id: OTHER }, { dongle_id: DONGLE }] });
    store.dispatch(syncStateFromUrl('/'));
    expect(store.dispatch).toHaveBeenCalledWith(replacement(`/${remembered === DONGLE ? DONGLE : OTHER}`));
  });

  it('root without devices applies the no-device dashboard', () => {
    const store = create({ devices: [] });
    store.dispatch(syncStateFromUrl('/'));
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: ACTION_APPLY_DESTINATION, destination: { kind: 'dashboard', dongleId: null } }));
    expect(store.getState().dongleId).toBeNull();
  });

  it('replaces unknown paths with root', () => {
    const store = create();
    store.dispatch(syncStateFromUrl('/unknown'));
    expect(store.dispatch).toHaveBeenCalledWith(replacement('/'));
  });

  it.each([true, false])('legacy conversion uses replace and respects stale responses (%s)', async (current) => {
    const path = `/${DONGLE}/1000/2000`;
    let resolve;
    Drives.getRoutesSegments.mockReturnValue(new Promise((done) => { resolve = done; }));
    const store = create({ router: { location: { pathname: path } } });
    const pending = store.dispatch(syncStateFromUrl(path));
    expect(store.dispatch.mock.calls.filter(([action]) => action.type === 'checkLastRoutesData')).toHaveLength(0);
    if (!current) store.dispatch({ type: LOCATION_CHANGE, payload: { location: { pathname: `/${OTHER}` } } });
    resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await pending;
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    const redirects = store.dispatch.mock.calls.filter(([action]) => action.payload?.method === 'replace');
    expect(redirects).toEqual(current ? [[replacement(`/${DONGLE}/${LOG}`)]] : []);
  });

  it.each([null, []])('legacy without a route applies dashboard but keeps the URL (%j)', async (routes) => {
    const path = `/${DONGLE}/1000/2000`;
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const store = create({ router: { location: { pathname: path } } });
    await store.dispatch(syncStateFromUrl(path));
    expect(store.getState().dongleId).toBe(DONGLE);
    expect(store.dispatch.mock.calls.filter(([action]) => action.payload?.method === 'replace')).toHaveLength(0);
  });

  it('changing device clears cached state and remembers it', () => {
    const store = create({ dongleId: OTHER, routes: [{}], files: {}, subscription: {}, lastRoutes: [{}] });
    store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, routes: null, files: null, subscription: null, lastRoutes: null, device: null });
    expect(localStorage.getItem('selectedDongleId')).toBe(DONGLE);
  });

  it('hydrates non-shared devices once and reuses a matching destination', () => {
    const store = create();
    store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    store.dispatch({ type: ACTION_STARTUP_DATA, devices: [{ dongle_id: DONGLE, is_owner: false }], profile: {} });
    store.dispatch(hydrateDevice(DONGLE));
    store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    expect(store.getState().device.is_owner).toBe(false);
    expect(store.dispatch.mock.calls.filter(([action]) => action.type === 'primeFetchSubscription')).toHaveLength(1);
    expect(store.dispatch.mock.calls.filter(([action]) => action.type === 'fetchDeviceOnline')).toHaveLength(1);
    store.dispatch({ type: ACTION_UPDATE_DEVICE_ONLINE, dongleId: DONGLE, last_athena_ping: 100, fetched_at: 100 });
    store.dispatch.mockClear();
    store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    expect(store.dispatch.mock.calls.filter(([action]) => action.type === ACTION_APPLY_DESTINATION)).toHaveLength(1);
    expect(store.dispatch.mock.calls.filter(([action]) => action.type === 'fetchDeviceOnline')).toHaveLength(0);
  });

  it('fetches an unlisted device even for a superuser', () => {
    const store = create({ devices: [], profile: { superuser: true } });
    store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'fetchSharedDevice', args: [DONGLE] });
  });

  it('disconnects WebRTC when a root with no devices clears the selection', () => {
    const store = create({ dongleId: DONGLE, devices: [] });
    store.dispatch(syncStateFromUrl('/'));
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
  });

  it('same device keeps routes and contained zoom keeps files, without a stack', () => {
    const routes = [{ log_id: LOG, duration: 60000 }];
    const files = {};
    const store = create({ dongleId: DONGLE, routes, zoom: { start: 0, end: 60000 }, selectedRouteId: LOG, files });
    store.dispatch(syncStateFromUrl(`/${DONGLE}/${LOG}/10/20`));
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().files).toBe(files);
    expect(store.getState().zoom).toEqual({ start: 10000, end: 20000 });
    const before = store.getState();
    store.dispatch(syncStateFromUrl(`/${DONGLE}/${LOG}/10/20`));
    for (const key of ['zoom', 'loop', 'files', 'device']) {
      expect(store.getState()[key]).toBe(before[key]);
    }
    store.dispatch(syncStateFromUrl(`/${DONGLE}/${LOG}`));
    expect(store.getState().files).toBeNull();
    expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
  });

  it('keeps playback when a zero-start loop fits the new zoom', () => {
    const loop = { startTime: 0, duration: 60000 };
    const store = create({ dongleId: DONGLE, selectedRouteId: LOG, routes: [{ log_id: LOG, duration: 60000 }],
      zoom: { start: 10000, end: 20000 }, loop, offset: 12345, desiredPlaySpeed: 0, isBufferingVideo: false });
    store.dispatch(syncStateFromUrl(`/${DONGLE}/${LOG}`));
    expect(store.getState().loop).toBe(loop);
    expect(store.getState()).toMatchObject({ offset: 12345, desiredPlaySpeed: 0, isBufferingVideo: false });
  });

  it.each(['settings', 'prime', 'stream'])('applies %s and preserves same-device routes', (kind) => {
    const routes = [];
    const device = { dongle_id: DONGLE, is_owner: true };
    const store = create({ dongleId: DONGLE, routes, devices: [device], device: { dongle_id: DONGLE, is_owner: false } });
    store.dispatch(syncStateFromUrl(`/${DONGLE}/${kind}`));
    expect(store.getState().device).toBe(device);
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, primeNav: kind === 'prime', streamNav: kind === 'stream', selectedRouteId: null, zoom: null });
    expect(store.getState().routes).toBe(routes);
  });
});
