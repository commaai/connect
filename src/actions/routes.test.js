import { checkRoutesData } from './index';
import { api } from '../api/backend';
import { ACTION_ROUTES_METADATA } from './types';

vi.mock('../timeline/playback', () => ({ reducer: (state) => state, resetPlayback: vi.fn(), selectLoop: vi.fn() }));

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn() },
} }));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const DONGLE = 'aaaaaaaaaaaaaaaa';
const FIRST = '2026-08-06--12-00-00';
const SECOND = '2026-08-06--13-00-00';
function route(log) {
  return { fullname: `${DONGLE}|${log}`, url: 'https://example.com',
    start_time_utc_millis: 1000, end_time_utc_millis: 61000,
    segment_start_times: [1000], segment_end_times: [61000], segment_numbers: [0] };
}
function store() {
  let state = { dongleId: DONGLE, selectedRouteId: FIRST, routes: null, routesMeta: null,
    filter: { start: 0, end: 100000 }, limit: 5 };
  const getState = () => state;
  const dispatch = vi.fn((action) => typeof action === 'function' ? action(dispatch, getState) : action);
  return { dispatch, getState, setState: (next) => { state = { ...state, ...next }; } };
}

beforeEach(() => vi.clearAllMocks());

it('shares an in-flight metadata request for an unchanged selection', async () => {
  const pending = deferred();
  api.routes.getRoutesSegments.mockReturnValue(pending.promise);
  const { dispatch, getState } = store();
  const first = checkRoutesData()(dispatch, getState);
  expect(checkRoutesData()(dispatch, getState)).toBe(first);
  expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  pending.resolve([route(FIRST)]);
  await first;
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: ACTION_ROUTES_METADATA }));
});

it.each(['old first', 'new first'])('discards superseded responses on the same device (%s)', async (order) => {
  const old = deferred();
  const current = deferred();
  api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const { dispatch, getState, setState } = store();
  const first = checkRoutesData()(dispatch, getState);
  setState({ selectedRouteId: SECOND });
  const second = checkRoutesData()(dispatch, getState);
  if (order === 'old first') { old.resolve([route(FIRST)]); await first; }
  current.resolve([route(SECOND)]);
  await second;
  if (order === 'new first') { old.resolve([route(FIRST)]); await first; }
  const metadata = dispatch.mock.calls.map(([action]) => action).filter((action) => action.type === ACTION_ROUTES_METADATA);
  expect(metadata).toHaveLength(1);
  expect(metadata[0].routes[0].log_id).toBe(SECOND);
});

it('keeps pending requests separate between stores', async () => {
  const pending = deferred();
  api.routes.getRoutesSegments.mockReturnValue(pending.promise);
  const first = store();
  const second = store();
  const requests = [first, second].map(({ dispatch, getState }) => checkRoutesData()(dispatch, getState));
  expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  pending.resolve([route(FIRST)]);
  await Promise.all(requests);
  for (const { dispatch } of [first, second]) {
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: ACTION_ROUTES_METADATA }));
  }
});
