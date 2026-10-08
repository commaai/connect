import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { checkRoutesData, pushTimelineRange, popTimelineRange, setModal } from './index';
import { ACTION_ROUTES_METADATA } from './types';
import { seek } from '../timeline/playback';
import sourceRoute from '../test-data/public-route.json';

// Retrieved public demo source, not invented navigation records. See README provenance.
const DONGLE = sourceRoute.dongle_id;
const LOG = sourceRoute.fullname.split('|')[1];
const PATH = `/${DONGLE}/${LOG}`;
const route = {
  ...sourceRoute, log_id: LOG,
  duration: sourceRoute.end_time_utc_millis - sourceRoute.start_time_utc_millis,
};

function app(pathname = PATH, preload = true) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(history.location.pathname));
  const locationChanged = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(locationChanged);
  locationChanged(history.location, history.action);
  if (preload) store.dispatch({
    type: ACTION_ROUTES_METADATA, dongleId: DONGLE, routes: [route],
    start: store.getState().filter.start, end: store.getState().filter.end, routeId: null,
  });
  return { store, history };
}

beforeEach(() => { vi.spyOn(api.routes, 'getRoutesSegments').mockResolvedValue([sourceRoute]); });
afterEach(async () => { await Promise.resolve(); await Promise.resolve(); vi.restoreAllMocks(); });

describe('navigation ownership and state reuse', () => {
  it('push, back, and forward restore exact drive ranges without adding history entries', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(LOG, 1001, 20002));
    expect(history.location.pathname).toBe(`${PATH}/1.001/20.002`);
    expect(store.getState().zoom).toMatchObject({ start: 1001, end: 20002 });
    history.goBack();
    expect(store.getState().zoom).toMatchObject({ start: 0, end: route.duration });
    expect(history.entries).toHaveLength(2);
    history.goForward();
    expect(store.getState().zoom).toMatchObject({ start: 1001, end: 20002 });
  });

  it('the in-app range back button unwinds its predecessor instead of oscillating', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(LOG, 0, 20000));
    store.dispatch(pushTimelineRange(LOG, 1000, 10000));
    store.dispatch(popTimelineRange(LOG));
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 20000 });
    store.dispatch(popTimelineRange(LOG));
    expect(history.location.pathname).toBe(PATH);
    expect(store.getState().zoom).toMatchObject({ start: 0, end: route.duration });
    expect(history.entries).toHaveLength(5);
  });

  it('refresh/direct entry restores the range predecessor held by its history entry', () => {
    const { store, history } = app({ pathname: `${PATH}/1/10`, state: { previousZoom: { start: 0, end: 20000 } } });
    expect(store.getState().zoom.previous).toEqual({ start: 0, end: 20000 });
    store.dispatch(popTimelineRange());
    expect(history.location.pathname).toBe(`${PATH}/0/20`);
  });

  it('range back survives modal entries and browser Forward', () => {
    const { store, history } = app();
    store.dispatch(pushTimelineRange(LOG, 0, 20000));
    store.dispatch(pushTimelineRange(LOG, 1000, 10000));
    history.goBack();
    history.goForward();
    store.dispatch(setModal('settings'));
    store.dispatch(setModal(null));
    store.dispatch(popTimelineRange());
    expect(history.location.search).toBe('');
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 20000 });
    store.dispatch(popTimelineRange());
    expect(history.location.pathname).toBe(PATH);
  });

  it('legacy timestamps preserve their route-relative media position', async () => {
    const start = sourceRoute.start_time_utc_millis;
    const { history, store } = app(`/${DONGLE}/${start + 10001}/${start + 20002}`, false);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`${PATH}/10.001/20.002`));
    await store.dispatch(checkRoutesData());
    expect(store.getState().zoom).toMatchObject({ start: 10001, end: 20002 });
  });

  it.each([[0, route.duration + 1000], [route.duration + 1000, route.duration + 2000]])('cold range %s/%s clamps to loaded media bounds consistently', async (start, end) => {
      const expected = { start: 0, end: route.duration };
      const { store } = app(`${PATH}/${start / 1000}/${end / 1000}`, false);
      await store.dispatch(checkRoutesData());
      expect(store.getState().zoom).toEqual(expected);
      expect(store.getState().loop).toEqual({ startTime: expected.start, duration: expected.end - expected.start });
  });

  it('modal push/close/back/forward preserve loaded objects and playback', () => {
    const { store, history } = app(`${PATH}/0/20`);
    store.dispatch(seek(12345));
    const before = store.getState();
    const calls = api.routes.getRoutesSegments.mock.calls.length;
    for (const modal of ['settings', 'uploads', 'pair', 'clips']) {
      store.dispatch(setModal(modal));
      expect(history.location.search).toBe(`?modal=${modal}`);
      store.dispatch(setModal(null));
      history.goBack();
      history.goForward();
      const after = store.getState();
      for (const key of ['currentRoute', 'routes', 'zoom', 'loop', 'files']) expect(after[key]).toBe(before[key]);
      expect(after.offset).toBe(before.offset);
      expect(after.desiredPlaySpeed).toBe(before.desiredPlaySpeed);
    }
    expect(api.routes.getRoutesSegments.mock.calls).toHaveLength(calls);
  });

  it('same-drive range navigation reuses route data and does not refetch it', () => {
    const { store } = app();
    const before = store.getState().currentRoute;
    store.dispatch(pushTimelineRange(LOG, 0, 20000));
    expect(store.getState().currentRoute).toBe(before);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('cold drive metadata is not mistaken for a complete dashboard list', async () => {
    const { store, history } = app(PATH, false);
    await store.dispatch(checkRoutesData());
    expect(store.getState().routesMeta.routeId).toBe(LOG);
    api.routes.getRoutesSegments.mockClear();
    history.push(`/${DONGLE}`);
    await store.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
    expect(api.routes.getRoutesSegments.mock.calls[0][4]).toBeUndefined();
    expect(store.getState().routesMeta.routeId).toBeNull();
  });

  it('each store owns its own request even when the requested real route is identical', async () => {
    const first = app(PATH, false);
    const second = app(PATH, false);
    await Promise.all([first.store.dispatch(checkRoutesData()), second.store.dispatch(checkRoutesData())]);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    expect(first.store.getState().currentRoute.fullname).toBe(sourceRoute.fullname);
    expect(second.store.getState().currentRoute.fullname).toBe(sourceRoute.fullname);
  });

  it('late legacy lookup cannot replace a newer user navigation', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { history } = app(`/${DONGLE}/${sourceRoute.start_time_utc_millis}/${sourceRoute.end_time_utc_millis}`);
    history.push(`${PATH}/0/20`);
    resolve([sourceRoute]);
    await Promise.resolve();
    expect(history.location.pathname).toBe(`${PATH}/0/20`);
  });

  it('pending legacy lookup follows harmless query changes without refetching', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { history } = app(`/${DONGLE}/${sourceRoute.start_time_utc_millis}/${sourceRoute.end_time_utc_millis}`);
    history.push({ ...history.location, search: '?share=1' });
    resolve([sourceRoute]);
    await vi.waitFor(() => expect(history.location.pathname).toBe(PATH));
    expect(history.location.search).toBe('?share=1');
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('legacy conversion replaces its own entry only after a successful lookup', async () => {
    const { history } = app(`/${DONGLE}/${sourceRoute.start_time_utc_millis}/${sourceRoute.end_time_utc_millis}`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(PATH));
    expect(history.entries).toHaveLength(1);
  });
});
