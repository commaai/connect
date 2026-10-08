import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { applyLocation } from './history';
import { navigate, openModal, closeModal, closeDrive } from './navigation';
import { checkRoutesData, selectRoute } from './index';

const DEVICE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
const OTHER = '2026-08-06--13-00-00';
const path = `/${DEVICE}/${LOG}`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
function rawRoute(log = LOG) {
  return { fullname: `${DEVICE}|${log}`, url: 'https://routes.example.com', create_time: 1,
    segment_start_times: [0], segment_end_times: [60000], segment_numbers: [0],
    start_time_utc_millis: 0, end_time_utc_millis: 60000 };
}
function setup(url = path) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState(history.location));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  vi.spyOn(api.auth, 'isAuthenticated').mockReturnValue(true);
  vi.spyOn(api.routes, 'getRoutesSegments').mockResolvedValue([rawRoute()]);
});
afterEach(() => vi.restoreAllMocks());

test('identical apply and query overlays preserve route, zoom, loop and files', async () => {
  const { history, store } = setup(`${path}/0/20`);
  await flush();
  store.dispatch({ type: 'ACTION_FILES_URLS', urls: { qlog: 'cached' } });
  const before = store.getState();
  store.dispatch(applyLocation(history.location));
  store.dispatch(openModal('files'));
  const after = store.getState();
  for (const key of ['currentRoute', 'zoom', 'loop', 'files']) expect(after[key]).toBe(before[key]);
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
  const count = history.length;
  store.dispatch(navigate({ page: 'drive', dongleId: DEVICE, logId: LOG, zoom: { start: 0, end: 20000 }, modal: 'files' }));
  expect(history.length).toBe(count);
});

test('drive-only metadata never certifies dashboard coverage on cold close', async () => {
  const { history, store } = setup(path);
  await flush();
  expect(store.getState().routes).toBeNull();
  expect(store.getState().currentRoute.log_id).toBe(LOG);
  store.dispatch(closeDrive());
  await flush();
  expect(history.length).toBe(1);
  expect(history.location.pathname).toBe(`/${DEVICE}`);
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  expect(store.getState().routes).toHaveLength(1);
});

test('cold modal close replaces, while an in-app open closes to its parent', async () => {
  const cold = setup(`${path}?modal=files&keep=1#map`);
  cold.store.dispatch(closeModal());
  expect(cold.history.length).toBe(1);
  expect(cold.history.location.search).toBe('?keep=1');
  expect(cold.history.location.hash).toBe('#map');
  cold.store.dispatch(openModal('settings', { modalDevice: DEVICE }));
  cold.store.dispatch(openModal('unpair', { modalDevice: DEVICE }));
  cold.store.dispatch(closeModal());
  expect(cold.history.location.search).toContain('modal=settings');
  cold.store.dispatch(closeModal());
  expect(cold.history.location.search).toBe('?keep=1');
});

test('late legacy A-B-A response cannot redirect the new visit', async () => {
  const first = deferred();
  const second = deferred();
  api.routes.getRoutesSegments.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const legacy = `/${DEVICE}/1000/2000`;
  const { history } = setup(legacy);
  history.push('/referrals');
  history.push(`${legacy}?keep=1#map`);
  first.resolve([rawRoute()]);
  await flush();
  expect(history.location.pathname).toBe(legacy);
  second.resolve([rawRoute()]);
  await flush();
  expect(history.location.pathname).toBe(path);
  expect(history.location.search).toBe('?keep=1');
  expect(history.location.hash).toBe('#map');
});

test('metadata A-B-A drops old result and cannot clear newer pending request', async () => {
  const old = deferred();
  const newer = deferred();
  api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockResolvedValueOnce([rawRoute(OTHER)]).mockReturnValueOnce(newer.promise);
  const { history, store } = setup(path);
  history.push(`/${DEVICE}/${OTHER}`);
  history.push(path);
  old.resolve([rawRoute()]);
  await flush();
  expect(store.getState().currentRoute).toBeNull();
  store.dispatch(checkRoutesData());
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(3);
  newer.resolve([rawRoute()]);
  await flush();
  expect(store.getState().currentRoute.log_id).toBe(LOG);
});

test('range changes preserve paused playback and cached route data', async () => {
  const { store } = setup(path);
  await flush();
  store.dispatch({ type: 'ACTION_PLAY', speed: 0 });
  const before = store.getState();
  store.dispatch(selectRoute(LOG, { start: 0, end: 1000 }));
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(store.getState().currentRoute).toBe(before.currentRoute);
  expect(store.getState().zoom).not.toHaveProperty('previous');
});

test('six page views survive browser back and forward', async () => {
  const { history, store } = setup(`/${DEVICE}`);
  const paths = [`/${DEVICE}`, path, `${path}/0/20`, `/${DEVICE}/prime`, `/${DEVICE}/stream`, '/referrals'];
  for (const pathname of paths.slice(1)) history.push(pathname);
  for (const pathname of paths.slice(0, -1).reverse()) {
    history.goBack();
    expect(store.getState().router.location.pathname).toBe(pathname);
  }
  for (const pathname of paths.slice(1)) {
    history.goForward();
    expect(store.getState().router.location.pathname).toBe(pathname);
  }
  expect(store.getState().selectedRouteId).toBeNull();
  await flush();
});

test('legacy lookup takes milliseconds once and survives a query-only overlay', async () => {
  const pending = deferred();
  api.routes.getRoutesSegments.mockReturnValueOnce(pending.promise);
  const { history } = setup(`/${DEVICE}/1700000000000/1700000060000`);
  expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DEVICE, 1700000000000, 1700000060000);
  history.replace(`/${DEVICE}/1700000000000/1700000060000?keep=1#map`);
  pending.resolve([rawRoute()]);
  await flush();
  expect(history.location.pathname).toBe(path);
  expect(history.location.search).toBe('?keep=1');
});

test('two stores do not share pending route requests', async () => {
  const pending = deferred();
  api.routes.getRoutesSegments.mockReturnValue(pending.promise);
  const first = setup(path);
  const second = setup(path);
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  pending.resolve([rawRoute()]);
  await flush();
  expect(first.store.getState().currentRoute.log_id).toBe(LOG);
  expect(second.store.getState().currentRoute.log_id).toBe(LOG);
});

test('failed old request cannot clear a newer visit request', async () => {
  let reject;
  const old = new Promise((_resolve, fail) => { reject = fail; });
  const newer = deferred();
  api.routes.getRoutesSegments.mockReturnValueOnce(old).mockResolvedValueOnce([rawRoute(OTHER)]).mockReturnValueOnce(newer.promise);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { history, store } = setup(path);
  history.push(`/${DEVICE}/${OTHER}`);
  history.push(path);
  reject(new Error('old request'));
  await flush();
  store.dispatch(checkRoutesData());
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(3);
  newer.resolve([rawRoute()]);
  await flush();
  expect(store.getState().currentRoute.log_id).toBe(LOG);
  expect(error).toHaveBeenCalled();
});


test('demo drive actions can navigate to non-alias Prime and stream', () => {
  const { history, store } = setup('/demo');
  store.dispatch(navigate({ page: 'prime', dongleId: 'deadbeefdeadbeef', demo: false }));
  expect(history.location.pathname).toBe('/deadbeefdeadbeef/prime');
  store.dispatch(navigate({ page: 'stream', dongleId: 'deadbeefdeadbeef', demo: false }));
  expect(history.location.pathname).toBe('/deadbeefdeadbeef/stream');
});


test('clip close restores clips inventory for both cold and in-app views', () => {
  const cold = setup(`${path}?modal=clip&clip=video.mp4`);
  cold.store.dispatch(closeModal());
  expect(cold.history.length).toBe(1);
  expect(cold.history.location.search).toBe('?modal=clips');
  cold.store.dispatch(openModal('delete-clip', { clip: 'video.mp4' }));
  cold.store.dispatch(closeModal());
  expect(cold.history.location.search).toBe('?modal=clips');
});

test('self-emitted fractional zoom survives overlays and history, cold URL stays canonical', () => {
  const { history, store } = setup(path);
  store.dispatch(navigate({ page: 'drive', dongleId: DEVICE, logId: LOG, zoom: { start: 10100, end: 10900 } }));
  expect(history.location.pathname).toBe(`${path}/10/11`);
  expect(store.getState().zoom).toEqual({ start: 10100, end: 10900 });
  store.dispatch(openModal('files'));
  store.dispatch(closeModal());
  history.goBack();
  history.goForward();
  expect(store.getState().zoom).toEqual({ start: 10100, end: 10900 });
  const cold = setup(`${path}/10/11`);
  expect(cold.store.getState().zoom).toEqual({ start: 10000, end: 11000 });
});


test('different exact ranges in the same rounded URL replace and apply without another entry', () => {
  const { history, store } = setup(path);
  store.dispatch(navigate({ page: 'drive', dongleId: DEVICE, logId: LOG, zoom: { start: 10100, end: 10900 } }));
  const length = history.length;
  store.dispatch(navigate({ page: 'drive', dongleId: DEVICE, logId: LOG, zoom: { start: 10200, end: 10800 } }));
  expect(history.length).toBe(length);
  expect(store.getState().zoom).toEqual({ start: 10200, end: 10800 });
});


test.each([
  '/demo/00000000--0000000001/20/10',
  '/demo/00000000--0000000001/1.5/9',
  '/demo/00000000--0000000001?modal=bogus',
  '/demo/notaroute/zzz',
])('invalid cold demo URL %s replaces to its dashboard instead of waiting forever', async (url) => {
  const { history, store } = setup(url);
  await flush();
  expect(history.length).toBe(1);
  expect(history.location.pathname).toBe('/demo');
  expect(history.location.search).toBe('');
  expect(store.getState().dongleId).toBe('deadbeefdeadbeef');
  expect(store.getState().routes).not.toBeNull();
  expect(store.getState().selectedRouteId).toBeNull();
});

test('invalid device URL retains its validated device and unrelated suffix', async () => {
  const { history, store } = setup(`/${DEVICE}/bad/path?keep=1&modal=bogus#map`);
  await flush();
  expect(history.location.pathname).toBe(`/${DEVICE}`);
  expect(history.location.search).toBe('?keep=1');
  expect(history.location.hash).toBe('#map');
  expect(store.getState().dongleId).toBe(DEVICE);
});

test('an unknown invalid prefix replaces to home without adding history', () => {
  const { history, store } = setup('/unknown/bad/path?keep=1&modal=bogus#map');
  expect(history.length).toBe(1);
  expect(history.location.pathname).toBe('/');
  expect(history.location.search).toBe('?keep=1');
  expect(history.location.hash).toBe('#map');
  expect(store.getState().dongleId).toBeNull();
});
