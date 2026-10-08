import { fetchEvents, fetchDriveCoords, fetchCoord } from './cached';
import reducer from '../reducers/globalState';
import * as Types from './types';
import { reverseLookup } from '../utils/geocode';

vi.mock('../utils', () => ({ emptyDevice: {} }));
vi.mock('../utils/geocode', () => ({ reverseLookup: vi.fn(async () => ({ place: 'Home' })) }));
vi.mock('../api/backend', () => ({ api: {
  routeAssets: {
    events: (route) => `https://route.test/${route.log_id}/events.json`,
    coords: (route) => `https://route.test/${route.log_id}/coords.json`,
  },
} }));

const DEVICE = 'aaaaaaaaaaaaaaaa';
let sequence = 0;
function makeRoute() {
  sequence += 1;
  const log_id = `00000000--${String(sequence).padStart(10, '0')}`;
  return { log_id, fullname: `${DEVICE}|${log_id}`, maxqlog: 0, duration: 60000 };
}
function harness(route, routes = null) {
  let state = { dongleId: DEVICE, routeCache: { [route.log_id]: route }, currentRoute: route, selectedRouteId: route.log_id, routes };
  const actions = [];
  const dispatch = (action) => {
    actions.push(action);
    state = reducer(state, action);
  };
  return { actions, dispatch, getState: () => state, run: (action) => action(dispatch, () => state) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true,
    json: async () => String(url).endsWith('coords.json') ? [{ t: 0, lng: 1, lat: 2 }] : [],
  })));
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

it('loads events and coordinates for a cold drive with no dashboard list', async () => {
  const route = makeRoute();
  const app = harness(route);
  await app.run(fetchEvents(route));
  await app.run(fetchDriveCoords(route));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(app.getState().currentRoute).toMatchObject({ events: [], driveCoords: { 0: [1, 2] } });
  expect(app.getState().routes).toBeNull();
});

it('reuses enrichment for an old drive outside the dashboard without dispatch loops', async () => {
  const route = makeRoute();
  const app = harness(route, [makeRoute()]);
  await app.run(fetchEvents(route));
  await app.run(fetchDriveCoords(route));
  const enriched = app.getState().currentRoute;
  const actionCount = app.actions.length;
  // Media asks again when currentRoute changes after asynchronous enrichment.
  await app.run(fetchEvents(enriched));
  await app.run(fetchDriveCoords(enriched));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(app.actions).toHaveLength(actionCount);
  expect(app.getState().currentRoute).toBe(enriched);
});

it('geocodes and reuses a cold drive location without needing dashboard routes', async () => {
  const route = makeRoute();
  const app = harness(route);
  await app.run(fetchCoord(route, [10.25, 20.25], 'startLocation'));
  const enriched = app.getState().currentRoute;
  const actionCount = app.actions.length;
  await app.run(fetchCoord(enriched, [10.25, 20.25], 'startLocation'));
  expect(reverseLookup).toHaveBeenCalledOnce();
  expect(enriched.startLocation).toEqual({ place: 'Home' });
  expect(app.actions).toHaveLength(actionCount);
});

it('a delayed enrichment updates its cache without replacing a newer drive selection', async () => {
  let resolveResponse;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveResponse = resolve; }));
  const oldRoute = makeRoute();
  const newRoute = makeRoute();
  const app = harness(oldRoute, [newRoute]);
  const pending = app.run(fetchEvents(oldRoute));
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  app.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: newRoute.log_id });
  const current = app.getState().currentRoute;
  resolveResponse({ ok: true, json: async () => [] });
  await pending;
  expect(app.getState().currentRoute).toBe(current);
  expect(app.getState().routeCache[oldRoute.log_id].events).toEqual([]);
  const actionCount = app.actions.length;
  await app.run(fetchEvents(oldRoute));
  expect(app.actions).toHaveLength(actionCount);
});

it.each([
  ['events', fetchEvents, 'events'],
  ['coordinates', fetchDriveCoords, 'driveCoords'],
])('settles concurrent %s failures and lets a later visit retry', async (_, load, key) => {
  const route = makeRoute();
  const firstVisit = harness(route);
  let rejectResponse;
  fetch.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectResponse = reject; }));
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const first = firstVisit.run(load(route));
    const second = firstVisit.run(load(route));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    rejectResponse(new Error('offline'));
    await Promise.all([first, second]);
    expect(firstVisit.actions).toHaveLength(0);
    const laterVisit = harness(route);
    await laterVisit.run(load(route));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(laterVisit.getState().currentRoute[key]).toBeDefined();
    expect(error).toHaveBeenCalledOnce();
  } finally { error.mockRestore(); }
});

it.each([fetchEvents, fetchDriveCoords])('does not cache a server failure as successfully empty data', async (load) => {
  const route = makeRoute();
  const app = harness(route);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await app.run(load(route));
    expect(app.actions).toHaveLength(0);
    await app.run(load(route));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(app.actions).toHaveLength(1);
  } finally { error.mockRestore(); }
});

it.each([fetchEvents, fetchDriveCoords])('retains missing-segment behavior without retrying a loaded empty result', async (load) => {
  const route = makeRoute();
  const app = harness(route);
  fetch.mockResolvedValueOnce({ ok: false, status: 404 });
  await app.run(load(route));
  await app.run(load(route));
  expect(fetch).toHaveBeenCalledOnce();
  expect(app.actions).toHaveLength(1);
});

it.each(['missing', 'rejected'])('settles a %s geocode result for all callers and retries later', async (failure) => {
  const route = makeRoute();
  const app = harness(route);
  const coord = [31 + sequence / 100, 42];
  const before = [...coord];
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    if (failure === 'missing') reverseLookup.mockResolvedValueOnce(null);
    else reverseLookup.mockRejectedValueOnce(new Error('offline'));
    await Promise.all([
      app.run(fetchCoord(route, coord, 'startLocation')),
      app.run(fetchCoord(route, coord, 'endLocation')),
    ]);
    expect(reverseLookup).toHaveBeenCalledOnce();
    expect(app.actions).toHaveLength(0);
    await app.run(fetchCoord(route, coord, 'startLocation'));
    expect(reverseLookup).toHaveBeenCalledTimes(2);
    expect(app.getState().currentRoute.startLocation).toEqual({ place: 'Home' });
    expect(coord).toEqual(before);
  } finally { error.mockRestore(); }
});

it('falls back to the network when IndexedDB reads fail and tolerates failed writes', async () => {
  const route = makeRoute();
  const app = harness(route);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const db = {
    objectStoreNames: { contains: (name) => ['events', 'coords', 'driveCoords'].includes(name) },
    transaction: () => ({ objectStore: () => ({
      index: () => ({ openCursor: () => ({}) }),
      get: () => { throw new Error('storage unavailable'); },
      put: () => { throw new Error('quota exceeded'); },
    }) }),
  };
  const open = vi.fn(() => {
    const request = {};
    queueMicrotask(() => request.onsuccess({ target: { result: db } }));
    return request;
  });
  vi.stubGlobal('indexedDB', { open });
  try {
    // The module caches its DB connection; isolate this storage failure from other cases.
    vi.resetModules();
    const isolated = await import('./cached');
    await app.run(isolated.fetchEvents(route));
    expect(fetch).toHaveBeenCalledOnce();
    expect(app.getState().currentRoute.events).toEqual([]);
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(2));
  } finally { error.mockRestore(); }
});
