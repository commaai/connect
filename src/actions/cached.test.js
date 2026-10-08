import { createMemoryHistory } from 'history';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { reverseLookup } from '../utils/geocode';
import { fetchCoord, fetchDriveCoords, fetchEvents } from './cached';

vi.mock('../api/backend', () => ({ api: { routeAssets: {
  events: (route, segment) => `${route.url}/${segment}/events.json`,
  coords: (route, segment) => `${route.url}/${segment}/coords.json`,
} } }));
vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));
vi.mock('../utils/geocode', () => ({ reverseLookup: vi.fn(async () => ({ place: 'Route start' })) }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const route = { fullname: `${DONGLE}|${LOG}`, log_id: LOG, url: 'https://routes.example.com', duration: 60000, maxqlog: 0 };

function create(extra = {}) {
  const history = createMemoryHistory({ initialEntries: [`/${DONGLE}/${LOG}`] });
  return createAppStore(history, {
    ...createInitialState(history.location.pathname), currentRoute: route, routeCache: { [LOG]: route }, ...extra,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith('events.json') ? [
    { type: 'event', route_offset_millis: 45, data: { event_type: 'first_road_camera_frame' } },
    { type: 'engage', route_offset_millis: 1000, data: {} },
  ] : [{ t: 1000, lng: -117.1, lat: 32.7 }]), { status: 200 })));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('a directly loaded drive fetches and reuses its event markers without a dashboard list', async () => {
  const store = create();
  expect(store.getState().routes).toBeNull();
  await store.dispatch(fetchEvents(route));
  expect(store.getState().currentRoute).toMatchObject({
    videoStartOffset: 45,
    events: expect.arrayContaining([{ type: 'engage', route_offset_millis: 1000, data: expect.objectContaining({ end_route_offset_millis: 60000 }) }]),
  });
  expect(store.getState().routeCache[LOG].events).toBe(store.getState().currentRoute.events);
  await store.dispatch(fetchEvents(route));
  expect(fetch).toHaveBeenCalledOnce();
});

test('a directly loaded drive fetches and reuses coordinates without a dashboard list', async () => {
  const store = create();
  await store.dispatch(fetchDriveCoords(route));
  expect(store.getState().currentRoute.driveCoords).toEqual({ 1000: [-117.1, 32.7] });
  await store.dispatch(fetchDriveCoords(route));
  expect(fetch).toHaveBeenCalledOnce();
});

test('a directly loaded drive can resolve and reuse its start location', async () => {
  const store = create();
  await store.dispatch(fetchCoord(route, [-117.1, 32.7], 'startLocation'));
  expect(store.getState().currentRoute.startLocation).toEqual({ place: 'Route start' });
  await store.dispatch(fetchCoord(route, [-117.1, 32.7], 'startLocation'));
  expect(reverseLookup).toHaveBeenCalledOnce();
});

test('an inactive cached drive reuses its loaded assets', async () => {
  const store = create({ currentRoute: null, routeCache: { [LOG]: {
    ...route, events: [], driveCoords: {}, startLocation: { place: 'Route start' },
  } } });
  await store.dispatch(fetchEvents(route));
  await store.dispatch(fetchDriveCoords(route));
  await store.dispatch(fetchCoord(route, [-117.1, 32.7], 'startLocation'));
  expect(fetch).not.toHaveBeenCalled();
  expect(reverseLookup).not.toHaveBeenCalled();
});
