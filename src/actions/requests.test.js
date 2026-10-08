import { vi } from 'vitest';
import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import globalState from '../reducers/globalState';
import { hardNavigate } from '../utils/navigation';
import { checkRoutesData, fetchSharedDevice } from './index';
import * as Types from './types';

vi.mock('../api', () => ({ athena: {}, billing: {} }));
vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: vi.fn() },
  routes: { getRoutesSegments: vi.fn() },
  devices: { fetchDevice: vi.fn() },
} }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../utils', () => ({ emptyDevice: {}, getDeviceFromState: vi.fn(), deviceVersionAtLeast: vi.fn(), deviceIsOnline: vi.fn() }));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';
const LOG = '0000010a--a51155e496';
const NEXT_LOG = '0000010b--a51155e496';
const RANGE = { start: 1000, end: 100000 };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function route(log = LOG, name = 'fresh') {
  return {
    fullname: `${DONGLE}|${log}`, name, create_time: 1,
    url: 'https://chffrprivate.blob.core.windows.net/test',
    segment_start_times: [10000], segment_end_times: [70000], segment_numbers: [0],
    start_time_utc_millis: 10000, end_time_utc_millis: 70000,
  };
}

function setup(selectedRouteId = null) {
  const location = { pathname: `/${DONGLE}${selectedRouteId ? `/${selectedRouteId}` : ''}`, search: '', hash: '' };
  let state = { ...createInitialState(location), filter: RANGE, devices: [], router: { location } };
  const actions = [];
  const getState = () => state;
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, getState);
    actions.push(action);
    state = globalState(state, action);
    return action;
  };
  return {
    actions, dispatch, getState,
    setState: (changes) => { state = { ...state, ...changes }; },
    selectDevice: (dongleId) => {
      dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId });
      state = { ...state, filter: RANGE, router: { location: { pathname: `/${dongleId}`, search: '', hash: '' } } };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.auth.isAuthenticated.mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('route request ownership', () => {
  it('starts a new request on A → B → A and ignores the first A result', async () => {
    const old = deferred();
    const fresh = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const store = setup();
    const first = store.dispatch(checkRoutesData());
    store.selectDevice(OTHER);
    store.selectDevice(DONGLE);
    const second = store.dispatch(checkRoutesData());
    expect(second).not.toBe(first);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    old.resolve([route(LOG, 'stale')]);
    await first;
    expect(store.getState().routeCache).toEqual({});
    expect(store.getState().routes).toBeNull();
    fresh.resolve([route()]);
    await second;
    expect(store.getState().routes.map(item => item.name)).toEqual(['fresh']);
  });

  it.each(['failure', 'empty'])('does not let an earlier device visit cause a %s redirect/error', async (outcome) => {
    const old = deferred();
    api.auth.isAuthenticated.mockReturnValue(false);
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise);
    const store = setup();
    const first = store.dispatch(checkRoutesData());
    store.selectDevice(OTHER);
    store.selectDevice(DONGLE);
    if (outcome === 'failure') old.reject(new Error('offline'));
    else old.resolve([]);
    await first;
    expect(store.actions.some(action => action.type === Types.ACTION_NAVIGATION_ERROR)).toBe(false);
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it('reuses a pending request when only a same-device overlay changes', async () => {
    const pending = deferred();
    api.routes.getRoutesSegments.mockReturnValue(pending.promise);
    const store = setup();
    const first = store.dispatch(checkRoutesData());
    store.setState({ router: { location: { pathname: `/${DONGLE}`, search: '?modal=settings', hash: '#keep' } } });
    expect(store.dispatch(checkRoutesData())).toBe(first);
    pending.resolve([route()]);
    await first;
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
    expect(store.getState().routes).toHaveLength(1);
  });

  it('reuses a single-drive request across same-device filter changes', async () => {
    const pending = deferred();
    api.routes.getRoutesSegments.mockReturnValue(pending.promise);
    const store = setup(LOG);
    const first = store.dispatch(checkRoutesData());
    store.dispatch({ type: Types.ACTION_SELECT_TIME_FILTER, start: 2000, end: 90000 });
    expect(store.dispatch(checkRoutesData())).toBe(first);
    pending.resolve([route()]);
    await first;
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
  });

  it('keeps useful single-drive metadata when another drive in the same device opens', async () => {
    const pending = deferred();
    api.routes.getRoutesSegments.mockReturnValue(pending.promise);
    const store = setup(LOG);
    const first = store.dispatch(checkRoutesData());
    store.setState({ selectedRouteId: NEXT_LOG, router: { location: { pathname: `/${DONGLE}/${NEXT_LOG}` } } });
    pending.resolve([route()]);
    await first;
    expect(store.getState().routeCache[LOG].log_id).toBe(LOG);
    expect(store.getState().currentRoute).toBeNull();
    expect(store.getState().routes).toBeNull();
  });

  it('ignores list data for a superseded filter but accepts the new filter response', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockResolvedValueOnce([route(NEXT_LOG)]);
    const store = setup();
    const first = store.dispatch(checkRoutesData());
    store.dispatch({ type: Types.ACTION_SELECT_TIME_FILTER, start: 2000, end: 90000 });
    await store.dispatch(checkRoutesData());
    old.resolve([route()]);
    await first;
    expect(store.getState().routes.map(item => item.log_id)).toEqual([NEXT_LOG]);
  });
});

describe('shared-device lookup failures', () => {
  it.each([
    [404, 'Device not found.'],
    [403, 'You do not have access to this device.'],
    [500, 'Unable to load device. Please try again.'],
    [null, 'Unable to load device. Please try again.'],
  ])('shows an actionable error for status %s', async (status, message) => {
    api.devices.fetchDevice.mockRejectedValue(status ? { resp: { status } } : new Error('offline'));
    const store = setup();
    await expect(store.dispatch(fetchSharedDevice(DONGLE))).resolves.toBeUndefined();
    expect(store.getState().deviceError).toBe(message);
    expect(store.actions).toContainEqual({ type: Types.ACTION_DEVICE_ERROR, dongleId: DONGLE, error: message });
  });

  it.each([null, undefined, [], 'invalid', {}, { dongle_id: OTHER }])('reports an unusable device response (%j)', async (response) => {
    api.devices.fetchDevice.mockResolvedValue(response);
    const store = setup();
    await store.dispatch(fetchSharedDevice(DONGLE));
    expect(store.getState().deviceError).toBe('Unable to load device. Please try again.');
    expect(store.actions.some(action => action.type === Types.ACTION_UPDATE_SHARED_DEVICE)).toBe(false);
  });

  it('clears the error after a successful retry', async () => {
    api.devices.fetchDevice.mockRejectedValueOnce({ resp: { status: 404 } })
      .mockResolvedValueOnce({ dongle_id: DONGLE, alias: 'Recovered device', is_owner: false });
    const store = setup();
    await store.dispatch(fetchSharedDevice(DONGLE));
    expect(store.getState().deviceError).toBe('Device not found.');
    await store.dispatch(fetchSharedDevice(DONGLE));
    expect(store.getState().deviceError).toBeNull();
    expect(store.getState().device.alias).toBe('Recovered device');
  });

  it.each(['failure', 'success'])('ignores late shared-device %s after A → B → A', async (outcome) => {
    const old = deferred();
    api.devices.fetchDevice.mockReturnValue(old.promise);
    const store = setup();
    const first = store.dispatch(fetchSharedDevice(DONGLE));
    store.selectDevice(OTHER);
    store.selectDevice(DONGLE);
    if (outcome === 'failure') old.reject({ resp: { status: 404 } });
    else old.resolve({ dongle_id: DONGLE, alias: 'Stale device' });
    await first;
    expect(store.getState().deviceError).toBeNull();
    expect(store.actions.some(action => [Types.ACTION_DEVICE_ERROR, Types.ACTION_UPDATE_SHARED_DEVICE].includes(action.type))).toBe(false);
  });

  it('does not let an earlier same-session failure replace a successful retry', async () => {
    const old = deferred();
    api.devices.fetchDevice.mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ dongle_id: DONGLE, alias: 'Recovered device', is_owner: false });
    const store = setup();
    const first = store.dispatch(fetchSharedDevice(DONGLE));
    await store.dispatch(fetchSharedDevice(DONGLE));
    old.reject({ resp: { status: 403 } });
    await first;
    expect(store.getState().deviceError).toBeNull();
    expect(store.getState().device.alias).toBe('Recovered device');
  });
});
