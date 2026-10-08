import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { selectDevice, pushTimelineRange } from './index';
import { navigate } from './navigation';
const DEVICE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
function setup(url) {
  const history = createMemoryHistory({ initialEntries: [url] });
  const store = createAppStore(history, createInitialState(history.location));
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}
beforeEach(() => {
  vi.spyOn(api.auth, 'isAuthenticated').mockReturnValue(true);
  vi.spyOn(api.routes, 'getRoutesSegments').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());
test('a device selection can leave the demo namespace', () => {
  const { history, store } = setup('/demo');
  expect(() => store.dispatch(selectDevice(DEVICE))).not.toThrow();
  expect(history.location.pathname).toBe(`/${DEVICE}`);
  expect(store.getState().dongleId).toBe(DEVICE);
});
test('an empty device selection can return home from demo', () => {
  const { history, store } = setup('/demo');
  expect(() => store.dispatch(selectDevice(null))).not.toThrow();
  expect(history.location.pathname).toBe('/');
});
test('global referrals navigation can leave the demo namespace', () => {
  const { history, store } = setup(`/demo/${LOG}`);
  expect(() => store.dispatch(navigate({ page: 'referrals' }))).not.toThrow();
  expect(history.location.pathname).toBe('/referrals');
});

test('in-app fractional selection keeps exact state while emitting enclosing integer URL', async () => {
  api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DEVICE}|${LOG}`, url: 'https://routes.example.com',
    create_time: 1, segment_start_times: [0], segment_end_times: [60000], segment_numbers: [0],
    start_time_utc_millis: 0, end_time_utc_millis: 60000 }]);
  const { history, store } = setup(`/${DEVICE}/${LOG}`);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  store.dispatch(pushTimelineRange(LOG, 10100, 10200));
  expect(history.location.pathname).toBe(`/${DEVICE}/${LOG}/10/11`);
  expect(store.getState().zoom).toEqual({ start: 10100, end: 10200 });
  const before = store.getState();
  history.push(`${history.location.pathname}?other=1`);
  expect(store.getState().zoom).toBe(before.zoom);
});

test('late metadata for another device cannot overwrite the current drive', async () => {
  const OTHER_DEVICE = 'bbbbbbbbbbbbbbbb';
  let finishOld;
  const old = new Promise((resolve) => { finishOld = resolve; });
  const raw = (dongleId) => ({ fullname: `${dongleId}|${LOG}`, url: 'https://routes.example.com', create_time: 1,
    segment_start_times: [0], segment_end_times: [60000], segment_numbers: [0],
    start_time_utc_millis: 0, end_time_utc_millis: 60000 });
  api.routes.getRoutesSegments.mockReturnValueOnce(old).mockResolvedValueOnce([raw(OTHER_DEVICE)]);
  const { history, store } = setup(`/${DEVICE}/${LOG}`);
  history.push(`/${OTHER_DEVICE}/${LOG}`);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const before = store.getState().currentRoute;
  finishOld([raw(DEVICE)]);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(store.getState().currentRoute).toBe(before);
  expect(store.getState().currentRoute.fullname).toBe(`${OTHER_DEVICE}|${LOG}`);
});

test('legacy conversion race is visit-owned even when the same old URL is revisited', async () => {
  vi.useFakeTimers();
  try {
    const legacy = `/${DEVICE}/1700000000000/1700000060000`;
    let oldResolve;
    let newResolve;
    api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { oldResolve = done; }))
      .mockReturnValueOnce(new Promise((done) => { newResolve = done; }));
    const { history } = setup(legacy);
    history.push('/referrals');
    history.push(legacy);
    setTimeout(() => oldResolve([{ fullname: `${DEVICE}|${LOG}` }]), 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(history.location.pathname).toBe(legacy);
    newResolve([{ fullname: `${DEVICE}|${LOG}` }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(history.location.pathname).toBe(`/${DEVICE}/${LOG}`);
  } finally { vi.useRealTimers(); }
});

test('late metadata on the same device cannot publish a route abandoned for Prime', async () => {
  let finish;
  api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const { history, store } = setup(`/${DEVICE}/${LOG}`);
  history.push(`/${DEVICE}/prime`);
  finish([{ fullname: `${DEVICE}|${LOG}`, url: 'https://routes.example.com', create_time: 1,
    segment_start_times: [0], segment_end_times: [60000], segment_numbers: [0],
    start_time_utc_millis: 0, end_time_utc_millis: 60000 }]);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(store.getState().routeCache[`${DEVICE}|${LOG}`]).toBeUndefined();
});
