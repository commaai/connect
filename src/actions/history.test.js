import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { openDialog, closeDialog } from './index';
import * as Types from './types';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    devices: { fetchDevice: vi.fn(async (dongleId) => ({ dongle_id: dongleId })) },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';
const START = 1786017600000;
const drivePath = '/' + DONGLE + '/' + LOG;

function route(logId = LOG) {
  return {
    fullname: DONGLE + '|' + logId, log_id: logId, duration: 60000,
    start_time_utc_millis: START, end_time_utc_millis: START + 60000,
    segment_start_times: [START], segment_end_times: [START + 60000], segment_numbers: [0],
    url: 'https://example.com/route', create_time: START,
  };
}

function create(pathname, preload = {}) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const initial = { ...createInitialState(history.location), devices: [], profile: null, ...preload };
  const store = createAppStore(history, initial);
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch({ type: LOCATION_CHANGE, payload: { location: history.location, action: 'POP' } });
  return { history, store };
}

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockResolvedValue([route()]);
});

describe('history to navigation state', () => {
  it.each(['push', 'replace'])('applies %s and browser Back/Forward through the same reducer', async (method) => {
    const { store, history } = create('/' + DONGLE + '/prime');
    history[method](drivePath + '/0/20.125');
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(LOG));
    expect(store.getState().zoom).toEqual({ start: 0, end: 20125 });
    history.push('/' + DONGLE + '/stream');
    expect(store.getState()).toMatchObject({ currentRoute: null, zoom: null, navigation: { page: 'stream' } });
    history.goBack();
    expect(store.getState().navigation.page).toBe('drive');
    expect(store.getState().zoom).toEqual({ start: 0, end: 20125 });
    history.goForward();
    expect(store.getState().navigation.page).toBe('stream');
  });

  it('reuses enriched drive data, files, range and playback across dialog navigation', async () => {
    const { store, history } = create(drivePath);
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: DONGLE + '|' + LOG, route: { preserved: true } });
    store.dispatch({ type: Types.ACTION_FILES_UPDATE, files: { camera: { url: 'cached' } } });
    store.dispatch({ type: Types.ACTION_PLAY, speed: 0 });
    store.dispatch({ type: Types.ACTION_SEEK, offset: 12345 });
    const before = store.getState();
    const calls = api.routes.getRoutesSegments.mock.calls.length;
    store.dispatch(openDialog('settings'));
    history.goBack();
    history.goForward();
    store.dispatch(closeDialog());
    const after = store.getState();
    for (const key of ['currentRoute', 'routes', 'routeCache', 'files', 'zoom', 'loop']) expect(after[key]).toBe(before[key]);
    expect(after.offset).toBe(before.offset);
    expect(after.desiredPlaySpeed).toBe(0);
    expect(after.startTime).toBe(before.startTime);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(calls);
  });

  it('retains dashboard enrichment when selecting a drive and refreshing its list', async () => {
    const { store, history } = create('/' + DONGLE);
    await vi.waitFor(() => expect(store.getState().routes?.length).toBe(1));
    const events = [{ type: 'event', route_offset_millis: 1250, data: { event_type: 'first_road_camera_frame' } }];
    const driveCoords = { 1: [-122, 37] };
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: route().fullname, events });
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: route().fullname, route: { driveCoords } });
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_LOCATION, fullname: route().fullname, locationKey: 'startLocation', location: { place: 'Route start' } });
    history.push(drivePath);
    expect(store.getState().currentRoute).toMatchObject({ events, videoStartOffset: 1250, driveCoords, startLocation: { place: 'Route start' } });
    expect(store.getState().currentRoute).toBe(store.getState().routes[0]);
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, routes: [route()] });
    expect(store.getState().currentRoute).toMatchObject({ videoStartOffset: 1250, driveCoords, startLocation: { place: 'Route start' } });
    store.dispatch({ type: Types.ACTION_SELECT_TIME_FILTER, ...store.getState().filter });
    store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_LOCATION, fullname: route().fullname, locationKey: 'endLocation', location: { place: 'Route end' } });
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, routes: [route()] });
    expect(store.getState().currentRoute.endLocation).toEqual({ place: 'Route end' });
  });

  it('keeps whole-drive and explicit full-range playback equivalent', async () => {
    const { store, history } = create(drivePath);
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    store.dispatch({ type: Types.ACTION_PLAY, speed: 0 });
    store.dispatch({ type: Types.ACTION_SEEK, offset: 23456 });
    const before = store.getState();
    history.push(drivePath + '/0/60');
    expect(store.getState().zoom).toBe(before.zoom);
    expect(store.getState().offset).toBe(23456);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('loads a dashboard list after closing a cold drive without poisoning the list cache', async () => {
    const { store, history } = create(drivePath);
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    expect(store.getState().routes).toBeNull();
    expect(store.getState().routesMeta.dongleId).toBeNull();
    api.routes.getRoutesSegments.mockResolvedValue([route(OTHER_LOG)]);
    history.push('/' + DONGLE);
    await vi.waitFor(() => expect(store.getState().routes?.[0].log_id).toBe(OTHER_LOG));
    expect(api.routes.getRoutesSegments.mock.calls.at(-1)).toEqual([DONGLE, expect.any(Number), expect.any(Number), 5]);
    history.goBack();
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(store.getState().routes[0].log_id).toBe(OTHER_LOG);
  });

  it('keeps same-device pending drive requests distinct and ignores stale selection', async () => {
    const first = deferred();
    const second = deferred();
    api.routes.getRoutesSegments.mockImplementation((_dongle, _start, _end, _limit, fullname) => (
      fullname.endsWith(OTHER_LOG) ? second.promise : first.promise
    ));
    const { store, history } = create(drivePath);
    history.push('/' + DONGLE + '/' + OTHER_LOG);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2));
    second.resolve([route(OTHER_LOG)]);
    await vi.waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(OTHER_LOG));
    first.resolve([route()]);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().currentRoute.log_id).toBe(OTHER_LOG);
    expect(store.getState().navigation.logId).toBe(OTHER_LOG);
  });

  it('replaces legacy URLs once, preserving the range, query and hash', async () => {
    const { history, store } = create('/' + DONGLE + '/' + (START + 1000) + '/' + (START + 20500) + '?ci=1&dialog=filter#map');
    await vi.waitFor(() => expect(history.location.pathname).toBe(drivePath + '/1/20.5'));
    expect(history.length).toBe(1);
    expect(history.location.search).toBe('?ci=1&dialog=filter');
    expect(history.location.hash).toBe('#map');
    expect(store.getState().navigation.dialog).toBe('filter');
  });

  it('does not redirect after a legacy lookup is superseded', async () => {
    const lookup = deferred();
    api.routes.getRoutesSegments.mockReturnValue(lookup.promise);
    const { history } = create('/' + DONGLE + '/' + START + '/' + (START + 60000));
    history.push('/' + DONGLE + '/prime');
    lookup.resolve([route()]);
    await Promise.resolve();
    await Promise.resolve();
    expect(history.location.pathname).toBe('/' + DONGLE + '/prime');
  });

  it('normalizes an out-of-bounds drive range after metadata loads', async () => {
    const { store, history } = create(drivePath + '/70/80');
    await vi.waitFor(() => expect(history.location.pathname).toBe(drivePath));
    expect(store.getState().zoom).toEqual({ start: 0, end: 60000 });
    expect(history.length).toBe(1);
  });

  it('clears an old drive and dialogs for an invalid location', async () => {
    const { store, history } = create(drivePath + '?dialog=settings');
    await vi.waitFor(() => expect(store.getState().currentRoute).not.toBeNull());
    history.push('/unknown?dialog=settings');
    expect(store.getState()).toMatchObject({ currentRoute: null, zoom: null, navigation: { page: 'not-found', dialog: null } });
  });
});
