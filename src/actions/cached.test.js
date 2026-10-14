import { fetchDriveCoords, fetchEvents } from './cached';
import * as Types from './types';

vi.mock('../api/backend', () => ({ api: { routeAssets: {
  events: (route, segment) => `${route.url}/${segment}/events.json`,
  coords: (route, segment) => `${route.url}/${segment}/coords.json`,
} } }));
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
let route;
let dispatch;
let routeNumber = 0;
const getState = () => ({ routes: [route] });
const staleEngageEvents = [{ type: 'engage', route_offset_millis: 0, data: { state: 1 } }];

function prepareRouteForEventsRetry() {
  route.events = staleEngageEvents;
  route.eventsError = true;
}

function stubFetch(mockImplementation) {
  const fetch = vi.fn().mockImplementation(mockImplementation);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => {
  routeNumber += 1;
  route = { fullname: `route|${routeNumber}`, url: 'https://assets.test/route', maxqlog: 1, duration: 120000 };
  dispatch = vi.fn((action) => {
    if (action.type === Types.ACTION_UPDATE_ROUTE_EVENTS) route.events = action.events;
    if (action.type === Types.ACTION_UPDATE_ROUTE) Object.assign(route, action.route);
  });
});
afterEach(() => vi.unstubAllGlobals());

it('retains successful coordinates and allows retry after a transient segment error', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response([{ t: 1000, lng: 1, lat: 2 }]))
    .mockResolvedValueOnce(response({}, 503));
  vi.stubGlobal('fetch', fetch);
  await fetchDriveCoords(route)(dispatch, getState);
  expect(route.driveCoords).toEqual({ 1000: [1, 2] });
  expect(route.driveCoordsError).toBe(true);
  fetch.mockResolvedValueOnce(response([{ t: 1000, lng: 1, lat: 2 }]))
    .mockResolvedValueOnce(response([{ t: 2000, lng: 3, lat: 4 }, { t: Number.NaN, lng: 3, lat: 4 }]));
  await fetchDriveCoords(route)(dispatch, getState);
  expect(route.driveCoords).toEqual({ 1000: [1, 2], 2000: [3, 4] });
  expect(route.driveCoordsError).toBe(false);
  await fetchDriveCoords(route)(dispatch, getState);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('treats missing qlog assets as a valid empty result', async () => {
  const fetch = vi.fn().mockImplementation(async () => response(null, 404));
  vi.stubGlobal('fetch', fetch);
  await fetchEvents(route)(dispatch, getState);
  expect(route.events).toEqual([]);
  expect(route.eventsError).toBe(false);
  await fetchEvents(route)(dispatch, getState);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('coalesces concurrent requests and retries malformed event payloads', async () => {
  const fetch = vi.fn().mockImplementation(async () => response({ invalid: true }));
  vi.stubGlobal('fetch', fetch);
  await Promise.all([fetchEvents(route)(dispatch, getState), fetchEvents(route)(dispatch, getState)]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(route.eventsError).toBe(true);
  fetch.mockImplementation(async () => response([]));
  await fetchEvents(route)(dispatch, getState);
  expect(route.eventsError).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it.each([
  {
    title: 'keeps loaded events when an incomplete retry returns no data',
    respond: () => response({}, 503),
    expect: (fetch) => {
      expect(fetch).toHaveBeenCalled();
      expect(route.events).toHaveLength(1);
      expect(route.eventsError).toBe(true);
    },
  },
  {
    title: 'still replaces events when a complete retry returns an empty route',
    respond: () => response([]),
    expect: (fetch) => {
      expect(fetch).toHaveBeenCalled();
      expect(route.events).toEqual([]);
      expect(route.eventsError).toBe(false);
    },
  },
])('$title', async ({ respond, expect: expectOutcome }) => {
  prepareRouteForEventsRetry();
  const fetch = stubFetch(async () => respond());
  await fetchEvents(route)(dispatch, getState);
  expectOutcome(fetch);
});

it('persists complete results but keeps transient failures out of IndexedDB', async () => {
  const records = new Map();
  const puts = vi.fn();
  const request = (result) => {
    const req = {};
    queueMicrotask(() => req.onsuccess?.({ target: { result } }));
    return req;
  };
  const db = { objectStoreNames: { contains: () => true }, transaction: () => ({
    objectStore: () => ({
      get: (key) => request(records.get(key)),
      put: (entry) => { puts(entry); records.set(entry.key, entry); return request(entry.key); },
    }),
  }) };
  vi.stubGlobal('indexedDB', { open: () => request(db) });
  const fetch = vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({}, 503));
  vi.stubGlobal('fetch', fetch);
  await fetchEvents(route)(dispatch, getState);
  expect(route.eventsError).toBe(true);
  expect(puts).not.toHaveBeenCalled();
  fetch.mockImplementation(async () => response([]));
  await fetchEvents(route)(dispatch, getState);
  await Promise.resolve();
  expect(puts).toHaveBeenCalledOnce();
  route.events = undefined;
  await fetchEvents(route)(dispatch, getState);
  expect(route.eventsError).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(4);
});
