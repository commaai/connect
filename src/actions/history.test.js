import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { checkRoutesData } from './index';
import { closeDialog, openDialog } from './navigation';
import { pause, play } from '../timeline/playback';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: vi.fn(() => true) },
  routes: { getRoutesSegments: vi.fn() },
  devices: { fetchDevice: vi.fn(async () => ({})) },
} }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
const D = '0000aaaa0000aaaa';
const B = '1111bbbb1111bbbb';
const L = '2026-08-06--12-00-00';
const OTHER = '2026-08-06--13-00-00';
function route(dongle = D, log = L) {
  return { fullname: `${dongle}|${log}`, log_id: log, url: 'https://routes.example.com',
    create_time: 1000, start_time_utc_millis: 1000, end_time_utc_millis: 61000,
    segment_start_times: [1000], segment_end_times: [61000], segment_numbers: [0] };
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function create(path = `/${D}`, initial = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const store = createAppStore(history, { ...createInitialState(history.location.pathname), ...initial });
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}
async function loaded(store) { await store.dispatch(checkRoutesData()); }

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockImplementation(async dongle => [route(dongle)]);
});

describe('URL -> state reconciliation', () => {
  it('applies PUSH, POP and REPLACE to the same device and range state', async () => {
    const { history, store } = create();
    await loaded(store);
    const routes = store.getState().routes;
    history.push(`/${D}/${L}/0/20`);
    expect(store.getState()).toMatchObject({ selectedRouteId: L, zoom: { start: 0, end: 20000 } });
    history.replace(`/${D}/${L}/1.001/2.009`);
    expect(store.getState().zoom).toEqual({ start: 1001, end: 2009 });
    history.goBack();
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null });
    history.goForward();
    expect(store.getState().zoom).toEqual({ start: 1001, end: 2009 });
    expect(store.getState().routes).toBe(routes);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
  });

  it('preserves drive, files, loop and speed through dialog changes and repeated drive URLs', async () => {
    const { history, store } = create(`/${D}/${L}`);
    await loaded(store);
    store.dispatch(pause());
    store.dispatch(play(2));
    const before = store.getState();
    history.push(`/${D}/${L}?dialog=settings&device=${B}`);
    history.goBack();
    history.push(`/${D}/${L}`);
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 2 });
    for (const key of ['currentRoute', 'zoom', 'loop', 'files', 'offset', 'startTime']) expect(store.getState()[key]).toBe(before[key]);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
  });

  it('does not treat single-drive metadata as a dashboard list', async () => {
    api.routes.getRoutesSegments.mockImplementation(async (_d, _s, _e, _limit, fullname) => [route(D, fullname ? L : OTHER)]);
    const { history, store } = create(`/${D}/${L}`);
    await loaded(store);
    expect(store.getState().routes).toBeNull();
    history.push(`/${D}`);
    await loaded(store);
    expect(store.getState().routes.map(r => r.log_id)).toEqual([OTHER]);
    history.goBack();
    expect(store.getState().currentRoute.log_id).toBe(L);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });


  it('bounds cold ranges to the drive and reuses their effective range', async () => {
    const { history, store } = create(`/${D}/${L}/10/999999`);
    await loaded(store);
    expect(store.getState().zoom).toEqual({ start: 10000, end: 60000 });
    const before = store.getState();
    history.push(`/${D}/${L}/10/999999?dialog=files`);
    expect(store.getState().zoom).toBe(before.zoom);
    expect(store.getState().loop).toBe(before.loop);
    history.push(`/${D}/${L}/999999/9999999`);
    expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
  });

  it('bounds the playback loop when metadata arrives after navigating to an uncached range', async () => {
    const { history, store } = create();
    await loaded(store);
    api.routes.getRoutesSegments.mockResolvedValue([route(D, OTHER)]);
    history.push(`/${D}/${OTHER}/10/999999`);
    await loaded(store);
    expect(store.getState().zoom).toEqual({ start: 10000, end: 60000 });
    expect(store.getState().loop).toEqual({ startTime: 10000, duration: 50000 });
  });

  it('handles a cold drive with zero duration without throwing or inventing a range', async () => {
    const zero = route();
    zero.end_time_utc_millis = zero.start_time_utc_millis;
    zero.segment_end_times = [...zero.segment_start_times];
    api.routes.getRoutesSegments.mockResolvedValue([zero]);
    const { store } = create(`/${D}/${L}`);
    await loaded(store);
    expect(store.getState().currentRoute.duration).toBe(0);
    expect(store.getState().zoom).toEqual({ start: 0, end: 0 });
  });

  it('shares identical in-flight requests within a store', async () => {
    const pending = deferred();
    api.routes.getRoutesSegments.mockReturnValue(pending.promise);
    const { store } = create(`/${D}/${L}`);
    const first = store.dispatch(checkRoutesData());
    const second = store.dispatch(checkRoutesData());
    expect(first).toBe(second);
    await Promise.resolve();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
    pending.resolve([route()]);
    await first;
  });

  it('keeps in-flight requests independent across stores', async () => {
    const pending = deferred();
    api.routes.getRoutesSegments.mockReturnValue(pending.promise);
    const one = create(`/${D}/${L}`);
    const two = create(`/${D}/${L}`);
    const requests = [one.store.dispatch(checkRoutesData()), two.store.dispatch(checkRoutesData())];
    await Promise.resolve();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    pending.resolve([route()]);
    await Promise.all(requests);
    expect(one.store.getState().currentRoute.log_id).toBe(L);
    expect(two.store.getState().currentRoute.log_id).toBe(L);
  });

  it('rejects an old device response after A -> B -> A', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockImplementationOnce(() => old.promise);
    const { history, store } = create(`/${D}/${L}`);
    await Promise.resolve();
    history.push(`/${B}/${L}`);
    await loaded(store);
    history.push(`/${D}/${L}`);
    await loaded(store);
    const current = store.getState().currentRoute;
    old.resolve([route(D, OTHER)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().currentRoute).toBe(current);
    expect(store.getState().driveRoutes[L].log_id).toBe(L);
  });

  it('a delayed previous drive cannot replace the current drive or dashboard', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockImplementationOnce(() => old.promise)
      .mockImplementation(async () => [route(D, OTHER)]);
    const { history, store } = create(`/${D}/${L}`);
    await Promise.resolve();
    history.push(`/${D}/${OTHER}`);
    await loaded(store);
    old.resolve([route()]);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().currentRoute.log_id).toBe(OTHER);
    expect(store.getState().routes).toBeNull();
  });

  it('replaces legacy links and preserves their query/hash', async () => {
    const { history, store } = create(`/${D}/1000/2000?ci=1#point`);
    await loaded(store);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${D}/${L}`));
    expect(history.length).toBe(1);
    expect(history.location).toMatchObject({ search: '?ci=1', hash: '#point' });
  });

  it('ignores a legacy response after navigating away and returning to the same URL', async () => {
    const old = deferred();
    let legacyCalls = 0;
    api.routes.getRoutesSegments.mockImplementation((_d, start) => {
      if (start === 1000) {
        legacyCalls += 1;
        return legacyCalls === 1 ? old.promise : Promise.resolve([]);
      }
      return Promise.resolve([route()]);
    });
    const path = `/${D}/1000/2000`;
    const { history, store } = create(path);
    history.push(`/${D}`);
    history.push(path);
    old.resolve([route()]);
    await loaded(store);
    expect(history.location.pathname).toBe(path);
  });
});

describe('dialog history', () => {
  it('closes app-opened dialogs through Back and restores them through Forward', async () => {
    const { history, store } = create(`/${D}?ci=1#point`);
    await loaded(store);
    store.dispatch(openDialog('filter'));
    expect(history.location.search).toBe('?ci=1&dialog=filter');
    store.dispatch(closeDialog());
    expect(history.location).toMatchObject({ search: '?ci=1', hash: '#point' });
    history.goForward();
    expect(history.location.search).toBe('?ci=1&dialog=filter');
  });

  it('closes cold dialogs without leaving the application', async () => {
    const { history, store } = create(`/${D}?dialog=settings&ci=1#point`);
    await loaded(store);
    store.dispatch(closeDialog());
    expect(history.length).toBe(1);
    expect(history.location).toMatchObject({ pathname: `/${D}`, search: '?ci=1', hash: '#point' });
  });

  it('returns a cold nested upload dialog to settings for the same device', async () => {
    const { history, store } = create(`/${D}/${L}?dialog=settings-uploads&device=${B}`);
    await loaded(store);
    store.dispatch(closeDialog());
    expect(history.location.search).toBe(`?dialog=settings&device=${B}`);
    expect(history.location.pathname).toBe(`/${D}/${L}`);
  });
});
