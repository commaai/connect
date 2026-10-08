import { fetchEvents, fetchDriveCoords, fetchCoord } from './cached';
import { reverseLookup } from '../utils/geocode';

vi.mock('../api/backend', () => ({ api: { routeAssets: {
  events: route => `${route.url}/events.json`, coords: route => `${route.url}/coords.json`,
} } }));
vi.mock('../utils/geocode', () => ({ reverseLookup: vi.fn(async () => ({ place: 'Start' })) }));
const route = { fullname: '0000aaaa0000aaaa|2026-08-06--12-00-00', log_id: '2026-08-06--12-00-00',
  maxqlog: 0, duration: 60000, url: 'https://route.example', start_time_utc_millis: 1000 };

it('fetches events, map coordinates and labels for a cold drive without a dashboard list', async () => {
  const fetchMock = vi.fn(async input => ({ ok: true, json: async () => String(input).includes('coords') ? [{ t: 1, lng: 2, lat: 3 }] : [] }));
  vi.stubGlobal('fetch', fetchMock);
  const dispatch = vi.fn();
  const getState = () => ({ routes: null, currentRoute: route, driveRoutes: { [route.log_id]: route } });
  await fetchEvents(route)(dispatch, getState);
  await fetchDriveCoords(route)(dispatch, getState);
  await fetchCoord(route, [2, 3], 'startLocation')(dispatch, getState);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ fullname: route.fullname, events: [] }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ route: { driveCoords: { 1: [2, 3] } } }));
  expect(reverseLookup).toHaveBeenCalledWith([2, 3]);
  vi.unstubAllGlobals();
});

it('reuses drive assets independently of dashboard metadata', async () => {
  const loaded = { ...route, events: [], driveCoords: {}, startLocation: { place: 'Start' } };
  const dispatch = vi.fn();
  const getState = () => ({ routes: null, currentRoute: null, driveRoutes: { [route.log_id]: loaded } });
  await fetchEvents(route)(dispatch, getState);
  await fetchDriveCoords(route)(dispatch, getState);
  await fetchCoord(route, [2, 3], 'startLocation')(dispatch, getState);
  expect(dispatch).not.toHaveBeenCalled();
});
