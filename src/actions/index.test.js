import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { navigate, pushTimelineRange, checkRoutesData } from './index';

vi.mock('../api/backend', () => ({ api: { auth: { isAuthenticated: () => false }, routes: { getRoutesSegments: vi.fn(async () => []) } } }));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';

function app() {
  const history = createMemoryHistory({ initialEntries: [`/${DONGLE}/${LOG}`] });
  const route = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };
  const store = createAppStore(history, { ...createInitialState(), dongleId: DONGLE, currentRoute: route,
    routes: [route], selectedRouteId: LOG, zoom: { start: 0, end: 60000 } });
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { history, store };
}

describe('navigation actions', () => {
  it('writes and applies a range beginning at zero', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(LOG, 0, 20000));
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}/0/20`);
    expect(store.getState().zoom).toEqual({ start: 0, end: 20000 });
  });

  it('retains millisecond precision for subsecond selections', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(LOG, 125, 999));
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}/0.125/0.999`);
    expect(store.getState().zoom).toEqual({ start: 125, end: 999 });
  });

  it('omits bounds for a whole drive', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(LOG, 0, 60000));
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
    expect(history.length).toBe(1);
  });

  it('closes the drive by navigating to its dashboard', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(null));
    expect(history.location.pathname).toBe(`/${DONGLE}`);
    expect(store.getState().selectedRouteId).toBeNull();
  });

  it.each(['prime', 'stream'])('opens %s through the URL', (page) => {
    const { store, history } = app();
    store.dispatch(navigate({ page, dongleId: DONGLE }));
    expect(history.location.pathname).toBe(`/${DONGLE}/${page}`);
    expect(store.getState().selectedRouteId).toBeNull();
  });
});


it('does not apply an earlier drive response to another device', async () => {
  let resolve;
  api.routes.getRoutesSegments.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const history = createMemoryHistory({ initialEntries: [`/${DONGLE}/${LOG}`] });
  const store = createAppStore(history, { ...createInitialState(), dongleId: DONGLE, selectedRouteId: LOG, currentRouteLoading: true });
  const request = store.dispatch(checkRoutesData());
  expect(store.dispatch(checkRoutesData())).toBe(request);
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: { pathname: '/1111bbbb1111bbbb', search: '', hash: '' }, action: 'PUSH' } });
  resolve([{ fullname: `${DONGLE}|${LOG}`, url: 'https://routes.example.com', segment_start_times: [0], segment_end_times: [60000], segment_numbers: [0] }]);
  await request;
  expect(store.getState().dongleId).toBe('1111bbbb1111bbbb');
  expect(store.getState().routes).toBeNull();
});
