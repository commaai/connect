import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { createMemoryHistory } from 'history';
import { checkRoutesData } from './index';
import * as Types from './types';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn() },
} }));

vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const rawRoute = {
  fullname: `${DONGLE}|${LOG}`, url: 'https://routes.example.com', segment_numbers: [0],
  segment_start_times: [1000], segment_end_times: [61000], start_time_utc_millis: 1000, end_time_utc_millis: 61000,
};

function create(extra = {}) {
  const history = createMemoryHistory({ initialEntries: [`/${DONGLE}`] });
  return createAppStore(history, { ...createInitialState(history.location.pathname), limit: 5, ...extra });
}

beforeEach(() => vi.clearAllMocks());

describe('route requests', () => {
  it('deduplicates the same request within a store, but not across stores', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const store = create();
    const first = store.dispatch(checkRoutesData());
    const second = store.dispatch(checkRoutesData());
    expect(second).toBe(first);
    resolve([]);
    await first;
    const another = create();
    const third = another.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    resolve([]);
    await third;
  });

  it('does not confuse an individually loaded drive with the dashboard list', async () => {
    api.routes.getRoutesSegments.mockResolvedValueOnce([rawRoute]).mockResolvedValueOnce([]);
    const store = create({ selectedRouteId: LOG });
    await store.dispatch(checkRoutesData());
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(store.getState().routes).toBeNull();
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null });
    await store.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    expect(store.getState().routes).toEqual([]);
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG });
    await store.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    expect(store.getState().currentRoute.log_id).toBe(LOG);
  });

  it.each(['device', 'filter', 'limit'])('ignores responses for an obsolete %s', async (change) => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const store = create();
    const pending = store.dispatch(checkRoutesData());
    if (change === 'device') store.dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId: '1111bbbb1111bbbb' });
    if (change === 'filter') store.dispatch({ type: Types.ACTION_SELECT_TIME_FILTER, start: 1, end: 2 });
    if (change === 'limit') store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: 10 });
    resolve([rawRoute]);
    await pending;
    expect(store.getState().routes).toBeNull();
    expect(store.getState().routeCache).toEqual({});
  });

  it('caches a missing drive without retrying it on every dialog change', async () => {
    api.routes.getRoutesSegments.mockResolvedValueOnce([]);
    const store = create({ selectedRouteId: LOG });
    await store.dispatch(checkRoutesData());
    await store.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
    expect(store.getState().routeCache[LOG]).toBeNull();
  });
});
