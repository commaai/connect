import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { checkRoutesData, selectTimeFilter } from './index';
import { pushTimelineRange } from './navigation';
import * as Types from './types';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn() },
  devices: { fetchDevice: vi.fn(async (dongleId) => ({ dongle_id: dongleId })) },
} }));
vi.mock('../api', () => ({ athena: {}, billing: {} }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const FIRST = '2026-08-06--12-00-00';
const SECOND = '2026-08-06--13-00-00';
function rawRoute(logId, dongleId = DONGLE) {
  return { fullname: `${dongleId}|${logId}`, url: 'https://routes.example.com', create_time: 1000,
    segment_start_times: [1000], segment_end_times: [61000], segment_numbers: [0],
    start_time_utc_millis: 1000, end_time_utc_millis: 61000 };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(pathname = `/${DONGLE}/${FIRST}`) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, { ...createInitialState(history.location), devices: [], limit: 5 });
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  return { store, history };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockReset().mockResolvedValue([]);
});

describe('navigation data loading', () => {
  it('deduplicates the same request within one store', async () => {
    const request = deferred();
    api.routes.getRoutesSegments.mockReturnValue(request.promise);
    const { store } = setup();
    const first = store.dispatch(checkRoutesData());
    expect(store.dispatch(checkRoutesData())).toBe(first);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(1);
    request.resolve([rawRoute(FIRST)]);
    await first;
    expect(store.getState().currentRoute.log_id).toBe(FIRST);
  });

  it('does not share in-flight state between stores', async () => {
    const first = setup().store;
    const second = setup().store;
    await Promise.all([first.dispatch(checkRoutesData()), second.dispatch(checkRoutesData())]);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('loads different drives concurrently and keeps a late result from selecting the wrong drive', async () => {
    const first = deferred();
    const second = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { store } = setup();
    const pending = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(SECOND, null, null));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    second.resolve([rawRoute(SECOND)]);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(SECOND));
    first.resolve([rawRoute(FIRST)]);
    await pending;
    expect(store.getState().currentRoute.log_id).toBe(SECOND);
    store.dispatch(pushTimelineRange(FIRST, null, null));
    expect(store.getState().currentRoute.log_id).toBe(FIRST);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('retains the dashboard list when loading a drive outside it', async () => {
    const { store, history } = setup(`/${DONGLE}`);
    api.routes.getRoutesSegments.mockResolvedValueOnce([rawRoute(FIRST)]).mockResolvedValueOnce([rawRoute(SECOND)]);
    await store.dispatch(checkRoutesData());
    const { routes, routesMeta } = store.getState();
    history.push(`/${DONGLE}/${SECOND}`);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(SECOND));
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().routesMeta).toBe(routesMeta);
    history.push(`/${DONGLE}`);
    expect(store.getState().routes).toBe(routes);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('does not treat a deep-linked drive as a loaded dashboard', async () => {
    const { store, history } = setup();
    api.routes.getRoutesSegments.mockResolvedValueOnce([rawRoute(FIRST)]).mockResolvedValueOnce([rawRoute(SECOND)]);
    await store.dispatch(checkRoutesData());
    expect(store.getState().routes).toBeNull();
    history.push(`/${DONGLE}`);
    await vi.waitFor(() => expect(store.getState().routes?.[0].log_id).toBe(SECOND));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('ignores an earlier device visit even after returning to that device', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockResolvedValue([]);
    const { store, history } = setup();
    const pending = store.dispatch(checkRoutesData());
    history.push(`/${OTHER}`);
    history.push(`/${DONGLE}/${FIRST}`);
    await vi.waitFor(() => expect(Object.hasOwn(store.getState().routeCache, FIRST)).toBe(true));
    old.resolve([rawRoute(FIRST)]);
    await pending;
    expect(store.getState().currentRoute).toBeNull();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(3);
  });

  it('ignores an old filter response without scheduling another fetch', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockResolvedValueOnce([rawRoute(SECOND)]);
    const { store } = setup(`/${DONGLE}`);
    const pending = store.dispatch(checkRoutesData());
    store.dispatch(selectTimeFilter(100, 200));
    await vi.waitFor(() => expect(store.getState().routes?.[0].log_id).toBe(SECOND));
    old.resolve([rawRoute(FIRST)]);
    await pending;
    expect(store.getState().routes[0].log_id).toBe(SECOND);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('reuses cached events and coordinates when returning to a drive', async () => {
    const { store } = setup();
    api.routes.getRoutesSegments.mockResolvedValue([rawRoute(FIRST)]);
    await store.dispatch(checkRoutesData());
    const events = [{ type: 'event', data: { event_type: 'other' } }];
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: `${DONGLE}|${FIRST}`, events });
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: `${DONGLE}|${FIRST}`, route: { driveCoords: { 0: [1, 2] } } });
    const cached = store.getState().currentRoute;
    store.dispatch(pushTimelineRange(null));
    store.dispatch(pushTimelineRange(FIRST));
    expect(store.getState().currentRoute).toBe(cached);
    expect(store.getState().currentRoute.events).toBe(events);
  });
});
