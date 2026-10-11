import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { checkRoutesData, openDialog, closeDialog, pushTimelineRange, popTimelineRange } from './index';
import init from './startup';

const mocks = vi.hoisted(() => ({ routes: vi.fn(), devices: vi.fn(), authenticated: true, redirect: vi.fn() }));
vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => mocks.authenticated },
  account: { getProfile: async () => null },
  devices: { listDevices: () => mocks.devices() },
  routes: { getRoutesSegments: (...args) => mocks.routes(...args) },
} }));
vi.mock('../utils/navigation', () => ({ hardNavigate: (...args) => mocks.redirect(...args) }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
const DEVICE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const SECOND = '2026-08-06--13-00-00';
const path = `/${DEVICE}/${LOG}`;
const devices = [{ dongle_id: DEVICE, shared: true }, { dongle_id: OTHER, shared: true }];
function route(log = LOG, dongle = DEVICE) {
  return { fullname: `${dongle}|${log}`, log_id: log, url: 'https://example.com', duration: 60000,
    segment_start_times: [1000], segment_end_times: [61000], segment_numbers: [0],
    start_time_utc_millis: 1000, end_time_utc_millis: 61000 };
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
function open(url, extra = {}) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, { ...createInitialState(), devices, ...extra });
  const update = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(update);
  update(history.location, 'POP');
  return { history, store };
}
beforeEach(() => {
  mocks.authenticated = true;
  mocks.routes.mockReset().mockResolvedValue([route()]);
  mocks.devices.mockReset().mockResolvedValue(devices);
  mocks.redirect.mockReset();
  localStorage.clear();
  vi.stubGlobal('gtag', vi.fn());
});

it('bounds cold and cached ranges to the drive duration without losing URL context or precision', async () => {
  const { history, store } = open(`${path}/0/120?dialog=settings&x=hello%20world#keep`);
  await store.dispatch(checkRoutesData());
  expect(history.location.pathname).toBe(path);
  expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
  history.push(`${path}/0.123/120?dialog=settings&x=hello%20world#keep`);
  expect(history.location.pathname).toBe(`${path}/0.123/60`);
  expect(store.getState().zoom).toEqual({ start: 123, end: 60000 });
  expect(history.location.search).toBe('?dialog=settings&x=hello%20world');
  expect(history.location.hash).toBe('#keep');
  history.push(`${path}/60/120`);
  expect(history.location.pathname).toBe(path);
  history.push(`${path}/0/0.001`);
  expect(store.getState().zoom).toEqual({ start: 0, end: 1 });
  expect(mocks.routes).toHaveBeenCalledTimes(1);
});

it('reuses cached drives and fetches uncached metadata without replacing dashboard coverage', async () => {
  mocks.routes.mockResolvedValueOnce([route()]).mockResolvedValue([route(SECOND)]);
  const { history, store } = open(path);
  const selection = store.getState().selection;
  await store.dispatch(checkRoutesData());
  expect(store.getState().selection).toBe(selection);
  const first = store.getState().currentRoute;
  expect(store.getState().routesMeta.dongleId).toBeNull();
  history.push(`/${DEVICE}`);
  await store.dispatch(checkRoutesData());
  const inventory = store.getState().routes;
  const coverage = store.getState().routesMeta;
  history.push(path);
  expect(store.getState().currentRoute).toBe(first);
  expect(mocks.routes).toHaveBeenCalledTimes(2);
  const uncached = '2026-08-06--14-00-00';
  mocks.routes.mockResolvedValueOnce([route(uncached)]);
  history.push(`/${DEVICE}/${uncached}`);
  await store.dispatch(checkRoutesData());
  const drive = store.getState().currentRoute;
  expect(store.getState().routes).toBe(inventory);
  expect(store.getState().routesMeta).toBe(coverage);
  history.goBack();
  expect(store.getState().currentRoute).toBe(first);
  history.goForward();
  expect(store.getState().currentRoute).toBe(drive);
  expect(mocks.routes).toHaveBeenCalledTimes(3);
  const stale = deferred();
  mocks.routes.mockReturnValueOnce(stale.promise);
  history.push(`/${DEVICE}?from=0&to=1`);
  const pending = store.dispatch(checkRoutesData());
  history.push(`${path}?from=0&to=1`);
  const metadata = store.getState().routeMetadata;
  stale.resolve([{ ...route(), distance: 999 }]);
  await pending;
  expect(store.getState().currentRoute).toBe(first);
  expect(store.getState().routeMetadata[`${DEVICE}|${LOG}`]).toBe(first);
  expect(store.getState().routeMetadata).toBe(metadata);
  expect(store.getState().routesMeta.dongleId).toBeNull();
});

it.each([false, true])('ignores obsolete empty public-drive results (return to A: %s)', async (returnToA) => {
  mocks.authenticated = false;
  const first = deferred();
  mocks.routes.mockReturnValueOnce(first.promise).mockResolvedValueOnce([route(SECOND)])
    .mockReturnValue(deferred().promise);
  const { history, store } = open(path);
  history.push(`/${DEVICE}/${SECOND}`);
  await store.dispatch(checkRoutesData());
  if (returnToA) history.push(path);
  first.resolve([]);
  await first.promise;
  await Promise.resolve();
  expect(store.getState().selectedRouteId).toBe(returnToA ? LOG : SECOND);
  expect(store.getState().routeError).toBeNull();
  expect(mocks.redirect).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(mocks.routes).toHaveBeenCalledTimes(returnToA ? 3 : 2));
});

it('scopes obsolete metadata to its drive and never substitutes the selected drive', async () => {
  const first = deferred();
  mocks.routes.mockReturnValueOnce(first.promise).mockResolvedValue([route(SECOND)]);
  const { history, store } = open(path);
  history.push(`/${DEVICE}/${SECOND}`);
  await store.dispatch(checkRoutesData());
  const current = store.getState().currentRoute;
  first.resolve([route()]);
  await first.promise;
  await Promise.resolve();
  expect(store.getState().currentRoute).toBe(current);
  expect(store.getState().routeMetadata[`${DEVICE}|${LOG}`]).toBeDefined();
  expect(store.getState().routesMeta.dongleId).toBeNull();
});

it('does not let obsolete legacy resolution redirect A → B → A', async () => {
  const response = deferred();
  mocks.routes.mockReturnValueOnce(response.promise).mockReturnValue(deferred().promise);
  const legacy = `/${DEVICE}/1000/2000`;
  const { history } = open(legacy);
  history.push(`/${OTHER}`);
  history.push(legacy);
  response.resolve([route()]);
  await response.promise;
  await Promise.resolve();
  expect(history.location.pathname).toBe(legacy);
});

it('reconciles the current destination when asynchronous startup finishes', async () => {
  const response = deferred();
  mocks.devices.mockReturnValue(response.promise);
  const { history, store } = open('/', { devices: null });
  const startup = store.dispatch(init());
  history.push(`/${OTHER}/${SECOND}/0/0.123?dialog=settings#keep`);
  response.resolve(devices);
  await startup;
  await store.dispatch(checkRoutesData());
  expect(history.location.pathname).toBe(`/${OTHER}/${SECOND}/0/0.123`);
  expect(store.getState()).toMatchObject({ dongleId: OTHER, selectedRouteId: SECOND, zoom: { start: 0, end: 123 } });
});

it('closes cold and nested confirmations in the app and preserves browser history', () => {
  const { history, store } = open(`${path}?dialog=unpair&device=${OTHER}&x=y#keep`);
  store.dispatch(closeDialog());
  expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({ dialog: 'settings', device: OTHER, x: 'y' });
  store.dispatch(openDialog('unpair', OTHER));
  store.dispatch(closeDialog());
  expect(Object.fromEntries(new URLSearchParams(history.location.search))).toEqual({ dialog: 'settings', device: OTHER, x: 'y' });
  history.goForward();
  expect(history.location.search).toContain('dialog=unpair');
  expect(history.location.hash).toBe('#keep');
  expect(store.getState().dongleId).toBe(DEVICE);
});

it('uses browser history for zoom back and a whole-drive parent on a cold range', async () => {
  const { history, store } = open(path);
  await store.dispatch(checkRoutesData());
  store.dispatch(pushTimelineRange(LOG, 0, 123));
  store.dispatch({ type: 'ACTION_SEEK', offset: 112 });
  store.dispatch(pushTimelineRange(LOG, 10, 100));
  expect(store.getState().offset).toBe(10);
  store.dispatch(popTimelineRange(LOG));
  expect(history.location.pathname).toBe(`${path}/0/0.123`);
  history.goForward();
  expect(store.getState().zoom).toEqual({ start: 10, end: 100 });
  const cold = open(`${path}/0/0.123`);
  cold.store.dispatch(popTimelineRange(LOG));
  expect(cold.history.location.pathname).toBe(path);
});


it('restores the default date filter through Back without resetting an unchanged drive range', async () => {
  const { history, store } = open(path);
  await store.dispatch(checkRoutesData());
  const defaultFilter = store.getState().filter;
  const before = store.getState();
  history.push(`${path}?from=0&to=1000`);
  expect(store.getState().filter).toEqual({ start: 0, end: 1000 });
  expect(store.getState().zoom).toBe(before.zoom);
  history.goBack();
  expect(store.getState().filter).toEqual(defaultFilter);
  expect(store.getState().zoom).toBe(before.zoom);
});


it('leaves an unauthenticated legacy miss and its latest query and hash unchanged', async () => {
  mocks.authenticated = false;
  const response = deferred();
  mocks.routes.mockReturnValueOnce(response.promise);
  const legacy = `/${DEVICE}/1000/2000`;
  const { history, store } = open(`${legacy}?sig=a%2Fb#initial`);
  const latest = `${legacy}?sig=a%2Fb&x=hello%20world#updated`;
  history.replace(latest);
  const request = store.dispatch(checkRoutesData());
  response.resolve([]);
  await request;
  expect(history.location.pathname + history.location.search + history.location.hash).toBe(latest);
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.routes).toHaveBeenCalledTimes(1);
});
