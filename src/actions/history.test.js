import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { pushTimelineRange, popTimelineRange } from './index';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn(async () => []) },
} }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';

function app(pathname = `/${DONGLE}`, routes = null) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const initial = createInitialState(pathname, '');
  initial.devices = [DONGLE, OTHER].map(dongle_id => ({ dongle_id, shared: true }));
  initial.device = initial.devices[0];
  initial.routes = routes;
  const store = createAppStore(history, initial);
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { store, history };
}

beforeEach(() => vi.clearAllMocks());

it('PUSH, REPLACE, Back and Forward all select the device in the URL', () => {
  const { history, store } = app();
  history.push(`/${OTHER}`);
  expect(store.getState().dongleId).toBe(OTHER);
  history.replace(`/${OTHER}/prime`);
  expect(store.getState().primeNav).toBe(true);
  history.goBack();
  expect(store.getState()).toMatchObject({ dongleId: DONGLE, primeNav: false });
  history.goForward();
  expect(store.getState()).toMatchObject({ dongleId: OTHER, primeNav: true });
});

it('preserves a ranged drive when only its dialog changes', () => {
  const { history, store } = app(`/${DONGLE}/${LOG}/0/20`);
  const zoom = store.getState().zoom;
  history.push(`/${DONGLE}/${LOG}/0/20?modal=settings`);
  expect(store.getState().zoom).toBe(zoom);
  expect(store.getState().navigation.modal).toBe('settings');
});

it('nested timeline Go Back unwinds and browser Back restores the earlier range', () => {
  const { history, store } = app(`/${DONGLE}/${LOG}`, [{ log_id: LOG, duration: 60000 }]);
  history.replace(`/${DONGLE}/${LOG}/0/60`);
  store.dispatch(pushTimelineRange(LOG, 10000, 50000));
  store.dispatch(pushTimelineRange(LOG, 20000, 30000));
  store.dispatch(popTimelineRange(LOG));
  expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}/10/50`);
  store.dispatch(popTimelineRange(LOG));
  expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
  history.goBack();
  expect(store.getState().zoom).toMatchObject({ start: 10000, end: 50000 });
  store.dispatch(popTimelineRange(LOG));
  expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
});

it('does not apply an old legacy lookup after another location wins', async () => {
  let resolve;
  api.routes.getRoutesSegments.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { history, store } = app();
  history.push(`/${DONGLE}/1000/2000`);
  history.push(`/${DONGLE}/prime`);
  resolve([{ fullname: `${DONGLE}|${LOG}` }]);
  await Promise.resolve();
  expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
  expect(store.getState().primeNav).toBe(true);
});

it('keeps a sub-second timeline selection in the URL', () => {
  const { history, store } = app(`/${DONGLE}/${LOG}`, [{ log_id: LOG, duration: 60000 }]);
  store.dispatch(pushTimelineRange(LOG, 200, 900));
  expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}/0.2/0.9`);
  expect(store.getState().zoom).toMatchObject({ start: 200, end: 900 });
});

it('ignores the first lookup after leaving and revisiting the same legacy URL', async () => {
  let resolveOld;
  let resolveCurrent;
  api.routes.getRoutesSegments
    .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
    .mockReturnValueOnce(new Promise(done => { resolveCurrent = done; }));
  const { history } = app();
  const path = `/${DONGLE}/1000/2000`;
  history.push(path);
  history.push(`/${DONGLE}/prime`);
  history.push(path);
  resolveOld([{ fullname: `${DONGLE}|${LOG}` }]);
  await Promise.resolve();
  expect(history.location.pathname).toBe(path);
  resolveCurrent([{ fullname: `${DONGLE}|${LOG}` }]);
  await Promise.resolve();
  expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
});
