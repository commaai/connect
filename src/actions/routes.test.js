import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { createInitialState } from '../initialState';
import rootReducer from '../reducers';
import { checkLastRoutesData, checkRoutesData, pushTimelineRange } from './index';
import * as Types from './types';

const mocks = vi.hoisted(() => ({ routes: vi.fn(), authenticated: true, hardNavigate: vi.fn() }));
vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: mocks.routes }, auth: { isAuthenticated: () => mocks.authenticated } } }));
vi.mock('../utils/navigation', () => ({ hardNavigate: mocks.hardNavigate }));
vi.mock('../store', () => ({ default: { getState: () => { throw new Error('Unexpected global store access'); } } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DEVICE = 'aaaaaaaaaaaaaaaa';
const FIRST = '2026-08-06--12-00-00';
const SECOND = '2026-08-06--13-00-00';
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function route(log) {
  return { fullname: `${DEVICE}|${log}`, url: 'https://routes.example.com', create_time: 1000,
    start_time_utc_millis: 1000, end_time_utc_millis: 61000,
    segment_start_times: [1000], segment_end_times: [61000], segment_numbers: [0] };
}
function storeAt(log = FIRST) {
  return createStore(rootReducer, createInitialState(`/${DEVICE}/${log}`), applyMiddleware(thunk));
}

beforeEach(() => {
  mocks.routes.mockReset();
  mocks.hardNavigate.mockReset();
  mocks.authenticated = true;
});

describe('route request identity', () => {
  it('deduplicates exact requests but fetches another selected log on the same device', async () => {
    const first = deferred();
    const second = deferred();
    mocks.routes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = storeAt();
    const firstRequest = store.dispatch(checkRoutesData());
    expect(store.dispatch(checkRoutesData())).toBe(firstRequest);
    store.dispatch(pushTimelineRange(SECOND, null, null, false));
    const secondRequest = store.dispatch(checkRoutesData());
    expect(mocks.routes).toHaveBeenCalledTimes(2);
    second.resolve([route(SECOND)]);
    await secondRequest;
    expect(store.getState().currentRoute.log_id).toBe(SECOND);
    first.resolve([route(FIRST)]);
    await firstRequest;
    expect(store.getState().currentRoute.log_id).toBe(SECOND);
    expect(store.getState().routeDetails[`${DEVICE}|${FIRST}`].log_id).toBe(FIRST);
  });

  it('does not stamp a detail response as dashboard coverage', async () => {
    mocks.routes.mockResolvedValue([route(FIRST)]);
    const store = storeAt();
    await store.dispatch(checkRoutesData());
    expect(store.getState().currentRoute.log_id).toBe(FIRST);
    expect(store.getState().routes).toBeNull();
    expect(store.getState().routesMeta.dongleId).toBeNull();
  });

  it('keeps the dashboard list and its object identity while loading an older drive', async () => {
    const store = storeAt();
    const { filter, limit } = store.getState();
    const recent = { ...route(SECOND), log_id: SECOND, duration: 60000 };
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DEVICE, routeId: null, start: filter.start, end: filter.end, limit, routes: [recent] });
    const list = store.getState().routes;
    mocks.routes.mockResolvedValue([route(FIRST)]);
    await store.dispatch(checkRoutesData());
    expect(store.getState().routes).toBe(list);
    expect(store.getState().currentRoute.log_id).toBe(FIRST);
  });

  it('ignores an old route failure after a newer route succeeds', async () => {
    const first = deferred();
    const second = deferred();
    mocks.routes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = storeAt();
    const oldRequest = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(SECOND, null, null, false));
    const newRequest = store.dispatch(checkRoutesData());
    second.resolve([route(SECOND)]);
    await newRequest;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    first.reject(new Error('late failure'));
    await oldRequest;
    expect(store.getState().routeLoad).toMatchObject({ routeId: SECOND, status: 'ready', error: null });
    log.mockRestore();
  });

  it('unwinds nested selections instead of making Back toggle', async () => {
    mocks.routes.mockResolvedValue([route(FIRST)]);
    const store = storeAt();
    await store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(FIRST, 10000, 50000, false));
    store.dispatch(pushTimelineRange(FIRST, 20000, 30000, false));
    store.dispatch(pushTimelineRange(FIRST, 10000, 50000, false));
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 50000, previous: { start: 0, end: 60000 } });
    store.dispatch(pushTimelineRange(FIRST, 0, 60000, false));
    expect(store.getState().zoom.previous).toBeUndefined();
  });

  it('marks an out-of-bounds cold range invalid and recovers from its cached drive', async () => {
    mocks.routes.mockResolvedValue([route(FIRST)]);
    const store = createStore(rootReducer, createInitialState(`/${DEVICE}/${FIRST}/0/80`), applyMiddleware(thunk));
    await store.dispatch(checkRoutesData());
    expect(store.getState()).toMatchObject({
      currentRoute: null,
      routeLoad: { status: 'invalid', error: 'This time range is outside the drive.' },
    });
    const cached = store.getState().routeDetails[`${DEVICE}|${FIRST}`];
    store.dispatch(pushTimelineRange(FIRST, null, null, false));
    await store.dispatch(checkRoutesData());
    expect(store.getState().currentRoute).toBe(cached);
    expect(store.getState()).toMatchObject({
      zoom: { start: 0, end: 60000, previous: null },
      routeLoad: { status: 'ready', error: null },
    });
    expect(mocks.routes).toHaveBeenCalledOnce();
  });

  it('recovers a valid same-drive range after an invalid cached selection', async () => {
    mocks.routes.mockResolvedValue([route(FIRST)]);
    const store = storeAt();
    await store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(FIRST, 10000, 80000, false));
    expect(store.getState().routeLoad.status).toBe('invalid');
    store.dispatch(pushTimelineRange(FIRST, 10000, 20000, false));
    await store.dispatch(checkRoutesData());
    expect(store.getState()).toMatchObject({
      currentRoute: { log_id: FIRST }, zoom: { start: 10000, end: 20000, previous: null },
      routeLoad: { status: 'ready', error: null },
    });
    expect(mocks.routes).toHaveBeenCalledOnce();
  });


  it('reuses a pending drive request after a dashboard roundtrip changes the list limit', async () => {
    const detail = deferred();
    const dashboard = deferred();
    mocks.routes.mockImplementation((_dongle, _start, _end, _limit, fullname) => fullname ? detail.promise : dashboard.promise);
    const store = createStore(rootReducer, createInitialState(`/${DEVICE}/${FIRST}/0/80`), applyMiddleware(thunk));
    const detailRequest = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(null, null, null, false));
    store.dispatch(checkLastRoutesData());
    expect(store.getState().limit).toBe(5);
    store.dispatch(pushTimelineRange(FIRST, 0, 80000, false));
    expect(store.dispatch(checkRoutesData())).toBe(detailRequest);
    expect(mocks.routes).toHaveBeenCalledTimes(2);
    detail.resolve([route(FIRST)]);
    await detailRequest;
    expect(store.getState().routeLoad).toMatchObject({ status: 'invalid', error: 'This time range is outside the drive.' });
    dashboard.resolve([route(SECOND)]);
    await vi.waitFor(() => expect(store.getState().routes?.[0]?.log_id).toBe(SECOND));
    expect(store.getState().routeLoad.status).toBe('invalid');
  });

  it.each([[80000, 'invalid'], [20000, 'ready']])('keeps cached %s-range state after an older detail request fails', async (end, status) => {
    const detail = deferred();
    const dashboard = deferred();
    mocks.routes.mockImplementation((_dongle, _start, _end, _limit, fullname) => fullname ? detail.promise : dashboard.promise);
    const store = storeAt();
    const detailRequest = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(null, null, null, false));
    store.dispatch(checkLastRoutesData());
    dashboard.resolve([route(FIRST)]);
    await vi.waitFor(() => expect(store.getState().routes?.[0]?.log_id).toBe(FIRST));
    store.dispatch(pushTimelineRange(FIRST, 0, end, false));
    expect(store.getState().routeLoad.status).toBe(status);
    const before = store.getState().routeLoad;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    detail.reject(new Error('Older detail request failed'));
    await detailRequest;
    log.mockRestore();
    expect(store.getState().routeLoad).toBe(before);
    expect(store.getState().routeLoad.status).toBe(status);
    store.dispatch(pushTimelineRange(FIRST, null, null, false));
    await store.dispatch(checkRoutesData());
    expect(store.getState().routeLoad.status).toBe('ready');
    expect(mocks.routes).toHaveBeenCalledTimes(2);
  });

  it('still redirects an empty public drive after dashboard pagination changed', async () => {
    const detail = deferred();
    const dashboard = deferred();
    mocks.authenticated = false;
    mocks.routes.mockImplementation((_dongle, _start, _end, _limit, fullname) => fullname ? detail.promise : dashboard.promise);
    const pathname = `/${DEVICE}/${FIRST}/0/20`;
    const location = { pathname, search: '?dialog=files', hash: '#video' };
    const store = createStore(rootReducer, { ...createInitialState(location), router: { location } }, applyMiddleware(thunk));
    const detailRequest = store.dispatch(checkRoutesData());
    store.dispatch(pushTimelineRange(null, null, null, false));
    store.dispatch(checkLastRoutesData());
    store.dispatch(pushTimelineRange(FIRST, 0, 20000, false));
    expect(store.dispatch(checkRoutesData())).toBe(detailRequest);
    detail.resolve([]);
    await detailRequest;
    expect(mocks.hardNavigate).toHaveBeenCalledExactlyOnceWith(`/?r=${encodeURIComponent(`${pathname}?dialog=files#video`)}`);
    dashboard.resolve([]);
    await vi.waitFor(() => expect(store.getState().routes).toEqual([]));
    expect(mocks.hardNavigate).toHaveBeenCalledOnce();
  });

});
