import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { closeModal } from './navigation';
import { OUTSIDE_DRIVE_RANGE_ERROR } from '../utils/driveRange';
import * as Types from './types';

vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn(() => new Promise(() => {})) },
  devices: { fetchDevice: vi.fn(() => new Promise(() => {})) },
} }));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '0000010a--a51155e496';
const DRIVE = `/${DONGLE}/${LOG}`;
const route = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };
const meta = () => ({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, selectedRouteId: LOG, routes: [route] });

function setup(path = DRIVE, extra = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const state = {
    ...createInitialState(history.location),
    routes: [route], routeCache: { [LOG]: route }, currentRoute: route, limit: 5,
    routesMeta: { dongleId: DONGLE, start: 0, end: Number.MAX_SAFE_INTEGER },
    ...extra,
  };
  const store = createAppStore(history, state);
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

it('replaces an overlong cached range and preserves overlay, query, hash and ancestry', () => {
  const previous = { start: 0, end: 60000, previous: null };
  const { history, store } = setup({ pathname: `${DRIVE}/10.001/90`, search: '?modal=drive-info&extra=x', hash: '#position', state: { zoomPrevious: previous } });
  expect(history.length).toBe(1);
  expect(history.location).toMatchObject({ pathname: `${DRIVE}/10.001/60`, search: '?modal=drive-info&extra=x', hash: '#position', state: { zoomPrevious: previous } });
  expect(store.getState().zoom).toEqual({ start: 10001, end: 60000, previous });
  expect(store.getState().loop).toEqual({ startTime: 10001, duration: 49999 });
  expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
});

it('bounds a cold URL as metadata arrives, with no invalid intermediate playback range', () => {
  const { history, store } = setup(`${DRIVE}/10.001/90?modal=drive-info&extra=x#position`, { routes: null, routeCache: {}, currentRoute: null });
  const observed = [];
  store.subscribe(() => observed.push(store.getState()));
  store.dispatch(meta());
  expect(history.location).toMatchObject({ pathname: `${DRIVE}/10.001/60`, search: '?modal=drive-info&extra=x', hash: '#position' });
  expect(history.length).toBe(1);
  expect(store.getState().zoom).toMatchObject({ start: 10001, end: 60000 });
  expect(store.getState().loop).toEqual({ startTime: 10001, duration: 49999 });
  expect(observed.every((state) => !state.currentRoute || state.zoom?.end <= route.duration)).toBe(true);
});

it.each([false, true])('rejects a fully outside range with matching warm/cold behavior (cold=%s)', (cold) => {
  const { history, store } = setup(`${DRIVE}/70/90`, cold ? { routes: null, routeCache: {}, currentRoute: null } : {});
  const observed = [];
  store.subscribe(() => observed.push(store.getState()));
  if (cold) store.dispatch(meta());
  expect(history.location.pathname).toBe(`${DRIVE}/70/90`);
  expect(store.getState()).toMatchObject({ zoom: null, loop: null, navigationError: OUTSIDE_DRIVE_RANGE_ERROR });
  expect(observed.every((state) => !state.currentRoute || state.zoom || state.navigationError === OUTSIDE_DRIVE_RANGE_ERROR)).toBe(true);
  history.push(`${DRIVE}/70/90?modal=drive-info`);
  expect(store.getState()).toMatchObject({ zoom: null, navigationError: OUTSIDE_DRIVE_RANGE_ERROR });
  history.replace(DRIVE);
  expect(store.getState()).toMatchObject({ zoom: { start: 0, end: 60000 }, navigationError: null });
});

it('keeps valid millisecond selections and playback references across repeated metadata', () => {
  const { history, store } = setup(`${DRIVE}/1.001/2.002`);
  const before = store.getState();
  store.dispatch(meta());
  expect(history.location.pathname).toBe(`${DRIVE}/1.001/2.002`);
  expect(store.getState().zoom).toBe(before.zoom);
  // This initial selection may have no loop yet; metadata initializes it once.
  const loop = store.getState().loop;
  store.dispatch(meta());
  expect(store.getState().loop).toBe(loop);
});

it('canonicalizes a cold settings alias once and closes without reopening it', () => {
  const { history, store } = setup(`/${DONGLE}/settings?extra=x#position`);
  expect(history.location).toMatchObject({ pathname: `/${DONGLE}`, search: '?extra=x&modal=settings', hash: '#position' });
  expect(history.length).toBe(1);
  store.dispatch(closeModal());
  expect(history.location).toMatchObject({ pathname: `/${DONGLE}`, search: '?extra=x', hash: '#position' });
  expect(history.length).toBe(1);
});

it('uses one pending legacy lookup across query changes and keeps the latest URL context', async () => {
  let resolve;
  api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { history } = setup(`/${DONGLE}`);
  const legacy = `/${DONGLE}/1000/2000`;
  history.push(`${legacy}?extra=old`);
  history.replace({ pathname: legacy, search: '?modal=settings&extra=new', hash: '#latest', state: { custom: true } });
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
  resolve([{ fullname: route.fullname }]);
  await vi.waitFor(() => expect(history.location.pathname).toBe(DRIVE));
  expect(history.location).toMatchObject({ search: '?modal=settings&extra=new', hash: '#latest', state: { custom: true } });
  expect(history.length).toBe(2);
});

it('invalidates the old legacy visit even after returning to the same pathname', async () => {
  let first;
  let second;
  api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((resolve) => { first = resolve; }));
  api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((resolve) => { second = resolve; }));
  const { history } = setup(`/${DONGLE}`);
  const legacy = `/${DONGLE}/1000/2000`;
  history.push(legacy);
  history.push(`/${DONGLE}/prime`);
  history.push(legacy);
  first([{ fullname: route.fullname }]);
  await Promise.resolve();
  expect(history.location.pathname).toBe(legacy);
  second([{ fullname: route.fullname }]);
  await vi.waitFor(() => expect(history.location.pathname).toBe(DRIVE));
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
});

it('normalizes a warm home link using the remembered known device', () => {
  const { history } = setup(`/${DONGLE}`, { devices: [{ dongle_id: DONGLE }] });
  localStorage.setItem('selectedDongleId', DONGLE);
  history.push('/?extra=x#position');
  expect(history.location).toMatchObject({ pathname: `/${DONGLE}`, search: '?extra=x', hash: '#position' });
  expect(history.length).toBe(2);
});
