import { vi } from 'vitest';
import { checkLastRoutesData, checkRoutesData, pushTimelineRange, selectTimeFilter } from './index';
import * as Types from './types';
import rootReducer from '../reducers';
import { createInitialState } from '../initialState';

const mocks = vi.hoisted(() => ({ getRoutesSegments: vi.fn() }));
vi.mock('../api/backend', () => ({
  api: { routes: { getRoutesSegments: mocks.getRoutesSegments }, auth: { isAuthenticated: () => true } },
}));

const DONGLE = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';
const OTHER = '2026-08-06--13-00-00';

function route(logId) {
  return {
    fullname: `${DONGLE}|${logId}`, create_time: 0, url: 'https://routes.example',
    segment_numbers: [0], segment_start_times: [0], segment_end_times: [10000],
    start_time_utc_millis: 0, end_time_utc_millis: 10000,
  };
}

function createStore(overrides = {}) {
  let state = {
    ...createInitialState(`/${DONGLE}/${LOG}/5/9`),
    filter: { start: 0, end: 100000 }, limit: 5, ...overrides,
  };
  const actions = [];
  const getState = () => state;
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, getState);
    actions.push(action);
    state = rootReducer(state, action);
    return action;
  };
  return { dispatch, getState, actions };
}

beforeEach(() => mocks.getRoutesSegments.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('route metadata scope', () => {
  it('fetches the dashboard list once after closing a cold direct route', async () => {
    mocks.getRoutesSegments.mockResolvedValueOnce([route(LOG)]).mockResolvedValueOnce([route(OTHER), route(LOG)]);
    const store = createStore();
    await store.dispatch(checkRoutesData());
    expect(store.getState().routesMeta.routeId).toBe(LOG);
    const events = [{ type: 'event', route_offset_millis: 800, data: { event_type: 'first_road_camera_frame' } }];
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: `${DONGLE}|${LOG}`, events });
    await store.dispatch(pushTimelineRange(null, null, null, false));
    expect(mocks.getRoutesSegments).toHaveBeenNthCalledWith(2, DONGLE, 0, 100000, 5);
    expect(store.getState().routesMeta.routeId).toBeNull();
    expect(store.getState().routes.map((entry) => entry.log_id)).toEqual([OTHER, LOG]);
    expect(store.getState().routes.find((entry) => entry.log_id === LOG)).toMatchObject({ events, videoStartOffset: 800 });
    await store.dispatch(checkRoutesData());
    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('reuses a full dashboard cache across ordinary route selection and close', () => {
    const store = createStore({ selectedRouteId: null, zoom: null });
    store.dispatch({
      type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, start: 0, end: 100000,
      routes: [LOG, OTHER].map((logId) => ({ ...route(logId), log_id: logId, duration: 10000 })),
    });
    const cachedRoutes = store.getState().routes;
    store.dispatch(pushTimelineRange(LOG, 5000, 9000, false));
    store.dispatch(pushTimelineRange(null, null, null, false));
    expect(store.getState().routes).toBe(cachedRoutes);
    expect(mocks.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('does not paginate a route-only lookup as though it were a complete dashboard list', async () => {
    mocks.getRoutesSegments.mockResolvedValue([route(LOG)]);
    const store = createStore();
    await store.dispatch(checkRoutesData());
    await store.dispatch(checkLastRoutesData());
    expect(store.getState().limit).toBe(5);
    expect(mocks.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('reuses an in-flight dashboard list when it contains the selected route', async () => {
    let resolveList;
    mocks.getRoutesSegments.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
    const store = createStore({ selectedRouteId: null, zoom: null });
    const pending = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(LOG, 5000, 9000, false));
    resolveList([route(LOG), route(OTHER)]);
    await pending;
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(store.getState().routesMeta.routeId).toBeNull();
    expect(store.getState().routes).toHaveLength(2);
    expect(mocks.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('ignores an older device response without clearing a newer request', async () => {
    let resolveOld;
    let resolveNew;
    mocks.getRoutesSegments
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
    const store = createStore({ selectedRouteId: null, zoom: null });
    const oldRequest = store.dispatch(checkRoutesData());
    store.dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId: 'bbbbbbbbbbbbbbbb' });
    const newRequest = store.dispatch(checkRoutesData());
    resolveOld([route(LOG)]);
    await oldRequest;
    expect(store.getState().routes).toBeNull();
    expect(store.dispatch(checkRoutesData())).toBe(newRequest);
    resolveNew([route(OTHER)]);
    await newRequest;
    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('discards a pending route lookup if the user closes before it completes', async () => {
    let resolveRoute;
    mocks.getRoutesSegments
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRoute = resolve; }))
      .mockResolvedValueOnce([route(OTHER), route(LOG)]);
    const store = createStore();
    const pending = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(null, null, null, false));
    resolveRoute([route(LOG)]);
    await pending;
    await vi.waitFor(() => expect(store.getState().routesMeta.routeId).toBeNull());
    expect(store.getState().routes).toHaveLength(2);
    expect(store.actions.filter((action) => action.type === Types.ACTION_ROUTES_METADATA)).toHaveLength(1);
    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('fetches the latest view after an obsolete route lookup fails', async () => {
    let rejectRoute;
    mocks.getRoutesSegments
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRoute = reject; }))
      .mockResolvedValueOnce([route(OTHER)]);
    const store = createStore();
    const pending = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(null, null, null, false));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectRoute(new Error('Obsolete lookup failed'));
    await pending;
    await vi.waitFor(() => expect(store.getState().routes).toHaveLength(1));
    expect(store.getState().routes[0].log_id).toBe(OTHER);
    expect(store.getState().routesMeta.routeId).toBeNull();
    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('caches an answered missing-route lookup without requesting it repeatedly', async () => {
    mocks.getRoutesSegments.mockResolvedValue([]);
    const store = createStore();
    await store.dispatch(checkRoutesData());
    await store.dispatch(checkRoutesData());
    expect(mocks.getRoutesSegments).toHaveBeenCalledOnce();
    expect(store.getState().routesMeta.routeId).toBe(LOG);
  });

  it('fetches a newly selected filter after the obsolete pending request fails', async () => {
    let rejectList;
    mocks.getRoutesSegments
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectList = reject; }))
      .mockResolvedValueOnce([route(OTHER)]);
    const store = createStore({ selectedRouteId: null, zoom: null });
    const pending = store.dispatch(checkRoutesData());
    store.dispatch(selectTimeFilter(200000, 300000));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectList(new Error('Old filter request failed'));
    await pending;
    await vi.waitFor(() => expect(store.getState().routesMeta.start).toBe(200000));
    expect(mocks.getRoutesSegments).toHaveBeenNthCalledWith(2, DONGLE, 200000, 300000, 5);
    expect(mocks.getRoutesSegments).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failed request while the view is unchanged', async () => {
    mocks.getRoutesSegments.mockRejectedValue(new Error('Current request failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore({ selectedRouteId: null, zoom: null });
    await store.dispatch(checkRoutesData());
    expect(mocks.getRoutesSegments).toHaveBeenCalledOnce();
    expect(store.getState().routes).toBeNull();
  });
});
