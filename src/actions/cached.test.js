import { createInitialState } from '../initialState';
import reducer from '../reducers/globalState';
import { reverseLookup } from '../utils/geocode';
import { fetchEvents, fetchDriveCoords, fetchCoord } from './cached';

vi.mock('../timeline', () => ({ currentOffset: vi.fn() }));
vi.mock('../utils/geocode', () => ({ reverseLookup: vi.fn(async () => ({ place: 'Route start' })) }));
vi.mock('../api/backend', () => ({ api: { routeAssets: {
  events: (route) => route.url + '/events.json', coords: (route) => route.url + '/coords.json',
} } }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const route = { fullname: DONGLE + '|' + LOG, log_id: LOG, duration: 60000, maxqlog: 0, url: 'https://example.com/route' };

it('loads events, video timing, map coordinates and address labels for a cold drive', async () => {
  let state = { ...createInitialState('/' + DONGLE + '/' + LOG), currentRoute: route, routeCache: { [LOG]: route } };
  const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => String(url).endsWith('/events.json')
    ? [{ type: 'event', route_offset_millis: 1250, data: { event_type: 'first_road_camera_frame' } }]
    : [{ t: 1, lng: -122, lat: 37 }] }));
  vi.stubGlobal('fetch', fetchMock);
  const dispatch = (action) => {
    if (typeof action === 'function') return action(dispatch, () => state);
    state = reducer(state, action);
  };
  try {
    await Promise.all([
      dispatch(fetchEvents(route)), dispatch(fetchDriveCoords(route)), dispatch(fetchCoord(route, [-122, 37], 'startLocation')),
    ]);
    expect(state.routes).toBeNull();
    expect(state.currentRoute).toMatchObject({
      videoStartOffset: 1250, driveCoords: { 1: [-122, 37] }, startLocation: { place: 'Route start' },
    });
    expect(state.currentRoute.events[0].data.event_type).toBe('first_road_camera_frame');
    expect(state.routeCache[LOG]).toBe(state.currentRoute);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reverseLookup).toHaveBeenCalledTimes(1);
    await Promise.all([
      dispatch(fetchEvents(route)), dispatch(fetchDriveCoords(route)), dispatch(fetchCoord(route, [-122, 37], 'startLocation')),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reverseLookup).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
