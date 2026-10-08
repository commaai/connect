import { vi } from 'vitest';
import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function route(dongleId = DONGLE) {
  return {
    fullname: `${dongleId}|${LOG}`, url: 'https://routes.example.com', create_time: 0,
    segment_numbers: [0], segment_start_times: [1000], segment_end_times: [61000],
    start_time_utc_millis: 1000, end_time_utc_millis: 61000,
  };
}

const onLocationChanged = (location, action) => ({ type: LOCATION_CHANGE, payload: { location, action } });

// A store wired like the app's, with the router's initial location applied.
function open(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState());
  history.listen((location, action) => store.dispatch(onLocationChanged(location, action)));
  store.dispatch(onLocationChanged(history.location, history.action));
  return { history, store };
}

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockResolvedValue([route()]);
});

describe('URL -> state', () => {
  it('selects the device in the URL and fetches its routes once', async () => {
    const { store } = open(`/${DONGLE}`);
    await flush();
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, limit: 5, selectedRouteId: null });
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('opens a drive range from a cold URL', async () => {
    const { store } = open(`/${DONGLE}/${LOG}/10/20`);
    await flush();
    expect(store.getState()).toMatchObject({
      selectedRouteId: LOG, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 },
    });
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, undefined, undefined, undefined, `${DONGLE}|${LOG}`);
  });

  it('switches device and drops the old one\'s routes', async () => {
    const { history, store } = open(`/${DONGLE}`);
    await flush();
    history.push(`/${OTHER}`);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, routes: null });
  });

  it('keeps loaded routes and playback when only a dialog changes', async () => {
    const { history, store } = open(`/${DONGLE}/${LOG}/10/20`);
    await flush();
    const before = store.getState();
    history.push(`/${DONGLE}/${LOG}/10/20?settings=${DONGLE}`);
    const during = store.getState();
    history.goBack();
    for (const state of [during, store.getState()]) {
      expect(state.routes).toBe(before.routes);
      expect(state.zoom).toBe(before.zoom);
      expect(state.loop).toBe(before.loop);
      expect(state.offset).toBe(before.offset);
    }
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('keeps the device and its routes when leaving and re-entering a drive', async () => {
    const { history, store } = open(`/${DONGLE}`);
    await flush();
    const { routes } = store.getState();
    history.push(`/${DONGLE}/${LOG}`);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 0, end: 60000 } });
    history.push(`/${DONGLE}`);
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null, loop: null });
    expect(store.getState().routes).toBe(routes);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it('steps back out of nested zooms one level at a time', async () => {
    const { history, store } = open(`/${DONGLE}/${LOG}`);
    await flush();
    history.push(`/${DONGLE}/${LOG}/10/40`);
    history.push(`/${DONGLE}/${LOG}/20/30`);
    expect(store.getState().zoom).toMatchObject({ start: 20000, end: 30000, previous: { start: 10000, end: 40000 } });

    // the drive view's back button navigates to the previous zoom, like the browser's back
    history.push(`/${DONGLE}/${LOG}/10/40`);
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 40000, previous: { start: 0, end: 60000 } });
    history.push(`/${DONGLE}/${LOG}`);
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 60000 });
  });

  it.each(['prime', 'stream'])('clears the drive on the %s page', async (page) => {
    const { history, store } = open(`/${DONGLE}/${LOG}`);
    await flush();
    history.push(`/${DONGLE}/${page}`);
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, selectedRouteId: null, zoom: null });
  });

  it('leaves state alone for a URL without a device', async () => {
    const { history, store } = open(`/${DONGLE}`);
    await flush();
    history.push('/referrals');
    expect(store.getState().dongleId).toBe(DONGLE);
  });
});

describe('legacy timestamp links', () => {
  it('are replaced by the drive they point at', async () => {
    const { history } = open(`/${DONGLE}/1000/2000`);
    await flush();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
    expect(history.action).toBe('REPLACE');
    expect(history.length).toBe(1);
  });

  it.each([['an empty', []], ['a null', null]])('stay for %s lookup', async (_name, routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const { history } = open(`/${DONGLE}/1000/2000`);
    await flush();
    expect(history.location.pathname).toBe(`/${DONGLE}/1000/2000`);
  });

  it('stay when the lookup fails', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { history } = open(`/${DONGLE}/1000/2000`);
    await flush();
    expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error);
    expect(history.location.pathname).toBe(`/${DONGLE}/1000/2000`);
    consoleError.mockRestore();
  });

  it('do not pull the user back after they moved on', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockImplementation((_dongleId, start) => (
      start === 1000 ? new Promise((r) => { resolve = r; }) : Promise.resolve([])
    ));
    const { history } = open(`/${DONGLE}/1000/2000`);
    history.push(`/${OTHER}`);
    resolve([route()]);
    await flush();
    expect(history.location.pathname).toBe(`/${OTHER}`);
  });
});
