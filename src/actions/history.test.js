import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { LOCATION_CHANGE } from 'connected-react-router';
import { onHistoryMiddleware, syncRoute } from './history';
import { checkRoutesData } from './index';
import { createInitialState } from '../initialState';
import globalState from '../reducers/globalState';
import { api } from '../api/backend';
import { createDemoBackend, DEMO_DONGLE_ID, PUBLIC_ROUTE_DONGLE_ID, PUBLIC_ROUTE_LOG_ID } from '../api/demo';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn() }, devices: { fetchDevice: vi.fn(async () => ({})) },
} }));
vi.mock('../api', () => ({ athena: {}, billing: { getSubscribeInfo: vi.fn(async () => null) } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

// This harness owns its store; do not initialize the browser singleton through timeline utilities.
vi.mock('../store', () => ({ default: {}, history: {} }));

const ID = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const SECOND = '2026-08-06--13-00-00';
const device = { dongle_id: ID, is_owner: true };
function route(log = LOG, id = ID) {
  return { fullname: `${id}|${log}`, log_id: log, duration: 60000, url: 'https://example.com',
    segment_start_times: [1000], segment_end_times: [61000], start_time_utc_millis: 1000,
    end_time_utc_millis: 61000, segment_numbers: [0] };
}
function setup(extra = {}) {
  return createStore((state, action) => {
    if (action.type === LOCATION_CHANGE) state = { ...state, router: { location: action.payload.location } };
    return globalState(state, action);
  }, { ...createInitialState(`/${ID}`), devices: [device], device, profile: {}, limit: 5,
    router: { location: { pathname: `/${ID}`, search: '' } }, ...extra }, applyMiddleware(thunk, onHistoryMiddleware));
}
function navigate(store, pathname, action = 'PUSH', search = '') {
  store.dispatch({ type: LOCATION_CHANGE, payload: { action, location: { pathname, search } } });
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockResolvedValue([]);
  localStorage.clear();
});

describe('URL state transitions', () => {

  it.each([['/demo', null, null], ['/deadbeefdeadbeef', null, null],
    ['/deadbeefdeadbeef/00000000--0000000001/0/20', '00000000--0000000001', { start: 0, end: 20000 }]])(
    'loads %s through the existing demo backend', async (pathname, selectedRouteId, zoom) => {
      const publicRoutes = vi.fn(async () => [route(PUBLIC_ROUTE_LOG_ID, PUBLIC_ROUTE_DONGLE_ID)]);
      const demo = createDemoBackend({ auth: {}, devices: {}, routes: { getRoutesSegments: publicRoutes } });
      api.routes.getRoutesSegments.mockImplementation(demo.routes.getRoutesSegments);
      const devices = await demo.devices.listDevices();
      const store = setup({ ...createInitialState(pathname), devices, device: devices[0], profile: await demo.account.getProfile() });
      await store.dispatch(syncRoute({ pathname }, DEMO_DONGLE_ID, true));
      await vi.waitFor(() => expect(store.getState().routes?.length).toBeGreaterThan(0));
      expect(store.getState().dongleId).toBe(DEMO_DONGLE_ID);
      expect(publicRoutes).toHaveBeenCalledOnce();
      expect(api.devices.fetchDevice).not.toHaveBeenCalled();
      expect(store.getState()).toMatchObject({ selectedRouteId, zoom });
    },
  );

  it('preserves dashboard membership when fetching an older drive', async () => {
    const recent = route(SECOND);
    const store = setup({ routes: [recent], routesMeta: { dongleId: ID, ...createInitialState('/').filter }, dashboardRouteIds: [recent.fullname] });
    api.routes.getRoutesSegments.mockResolvedValue([route()]);
    navigate(store, `/${ID}/${LOG}`);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(LOG));
    navigate(store, `/${ID}`);
    expect(store.getState().dashboardRouteIds).toEqual([recent.fullname]);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies %s with one descriptor and preserves device data', async (action) => {
    const metadata = route();
    const store = setup({ routes: [metadata], currentRoute: metadata, selectedRouteId: LOG,
      zoom: { start: 0, end: 60000 }, files: { video: 'cached' }, subscription: { id: 'sub' } });
    navigate(store, `/${ID}/${LOG}/0/20`, action);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 0, end: 20000 },
      navigation: { type: 'drive', logId: LOG }, subscription: { id: 'sub' }, files: { video: 'cached' } });
    expect(store.getState().currentRoute).toBe(metadata);
    expect(store.getState().device).toBe(device);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('fetches a different drive on the same device without resetting the device', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([route(SECOND)]);
    const store = setup({ routes: [route()], selectedRouteId: LOG, currentRoute: route() });
    navigate(store, `/${ID}/${SECOND}`);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(SECOND));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(ID, undefined, undefined, undefined, `${ID}|${SECOND}`);
    expect(store.getState().device).toBe(device);
    expect(store.getState().routes).toHaveLength(2);
  });

  it('rejects stale drive responses, including A to B to A', async () => {
    const first = deferred(); const second = deferred(); const third = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    const store = setup();
    navigate(store, `/${ID}/${LOG}`);
    navigate(store, `/${ID}/${SECOND}`);
    navigate(store, `/${ID}/${LOG}`);
    third.resolve([{ ...route(), distance: 3 }]);
    await vi.waitFor(() => expect(store.getState().currentRoute?.distance).toBe(3));
    first.resolve([{ ...route(), distance: 1 }]); second.resolve([route(SECOND)]);
    await Promise.all([first.promise, second.promise]);
    expect(store.getState().currentRoute.distance).toBe(3);
  });

  it('does not treat a single drive response as dashboard coverage', async () => {
    const store = setup();
    api.routes.getRoutesSegments.mockResolvedValue([route()]);
    navigate(store, `/${ID}/${LOG}`);
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    navigate(store, `/${ID}`);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    await store.dispatch(checkRoutesData());
    expect(store.getState().selectedRouteId).toBeNull();
  });

  it('clears device-specific data when changing devices', () => {
    const store = setup({ subscription: {}, files: {}, routes: [route()], currentRoute: route(), selectedRouteId: LOG });
    navigate(store, `/${OTHER}/settings`);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, subscription: null, files: null,
      routes: null, currentRoute: null, selectedRouteId: null, navigation: { type: 'settings' } });
  });

  it('keeps an obsolete legacy conversion from navigating after leaving', async () => {
    const pending = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(pending.promise);
    const store = setup();
    const conversion = store.dispatch(syncRoute({ pathname: `/${ID}/1000/2000` }));
    navigate(store, '/referrals');
    pending.resolve([route()]);
    await conversion;
    expect(store.getState().navigation.type).toBe('referrals');
    expect(store.getState().router.location.pathname).toBe('/referrals');
  });

  it('query-only modal changes preserve playback and cached metadata', () => {
    const metadata = route();
    const zoom = { start: 0, end: 60000 };
    const store = setup({ routes: [metadata], selectedRouteId: LOG, currentRoute: metadata, zoom, offset: 1234 });
    navigate(store, `/${ID}/${LOG}`, 'PUSH', '?modal=uploads');
    expect(store.getState().currentRoute).toBe(metadata);
    expect(store.getState().zoom).toBe(zoom);
    expect(store.getState().offset).toBe(1234);
  });
});
