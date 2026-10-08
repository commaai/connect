import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import * as Types from './types';

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
const ROUTE = {
  fullname: `${DONGLE}|${LOG}`,
  url: 'https://example.com/route',
  create_time: 0,
  start_time_utc_millis: 1000,
  end_time_utc_millis: 61000,
  segment_numbers: [0],
  segment_start_times: [1000],
  segment_end_times: [61000],
};

function setup(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(pathname));
  const go = (path) => store.dispatch({ type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname: path } } });
  return { history, store, go };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockResolvedValue([ROUTE]);
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { store } = setup(`/${DONGLE}`);
    expect(store.dispatch(undefined)).toBeUndefined();
  });

  it('selects the device in the URL and fetches its routes', async () => {
    const { store, go } = setup(`/${DONGLE}`);
    go(`/${OTHER}`);
    expect(store.getState().dongleId).toBe(OTHER);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(OTHER, expect.any(Number), expect.any(Number), 5);
    await flush();
  });

  it('fetches a drive directly when entering it on another device', async () => {
    const { store, go } = setup(`/${DONGLE}`);
    go(`/${OTHER}/${LOG}`);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, selectedRouteId: LOG });
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(OTHER, undefined, undefined, undefined, `${OTHER}|${LOG}`);
    await flush();
  });

  it('enters a zoomed drive and leaves it again', () => {
    const { store, go } = setup(`/${DONGLE}`);
    go(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({
      selectedRouteId: LOG,
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    });

    go(`/${DONGLE}`);
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null, loop: null });
  });

  it('loops playback over the whole drive once its duration is known', () => {
    const { store, go } = setup(`/${DONGLE}`);
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, routes: [{ fullname: ROUTE.fullname, log_id: LOG, duration: 60000 }] });

    go(`/${DONGLE}/${LOG}`);
    expect(store.getState()).toMatchObject({ zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } });

    go(`/${DONGLE}/${LOG}/10/20`);
    go(`/${DONGLE}/${LOG}`);
    expect(store.getState()).toMatchObject({ zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } });
  });

  it('keeps the drive and playback when its URL is applied again', () => {
    const { store, go } = setup(`/${DONGLE}`);
    go(`/${DONGLE}/${LOG}/10/20`);
    const { zoom, loop, offset } = store.getState();

    go(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({ offset });
    expect(store.getState().zoom).toBe(zoom);
    expect(store.getState().loop).toBe(loop);
  });

  it('keeps the device and its routes across pages that only the URL knows about', () => {
    const { store, go } = setup(`/${DONGLE}`);
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, routes: [] });
    const { routes } = store.getState();
    for (const path of [`/${DONGLE}/prime`, `/${DONGLE}/settings`, `/${DONGLE}/stream`, '/referrals', `/${DONGLE}`]) {
      go(path);
    }
    expect(store.getState()).toMatchObject({ dongleId: DONGLE });
    expect(store.getState().routes).toBe(routes);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('replaces a legacy timestamp URL with its drive', async () => {
    const { history, go } = setup(`/${DONGLE}`);
    history.push(`/${DONGLE}/1000/2000`);
    go(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(history.action).toBe('REPLACE');
  });

  it.each([
    ['finds nothing', () => api.routes.getRoutesSegments.mockResolvedValue([])],
    ['fails', () => api.routes.getRoutesSegments.mockRejectedValue(new Error('lookup failed'))],
  ])('keeps a legacy timestamp URL when the lookup %s', async (_name, arrange) => {
    arrange();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { history, go } = setup(`/${DONGLE}/1000/2000`);
    go(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await flush();
    expect(history.location.pathname).toBe(`/${DONGLE}/1000/2000`);
    consoleError.mockRestore();
  });

  it('does not redirect a legacy timestamp URL the user already left', async () => {
    const { history, go } = setup(`/${DONGLE}/1000/2000`);
    go(`/${DONGLE}/1000/2000`);
    history.push(`/${DONGLE}/prime`);
    go(`/${DONGLE}/prime`);
    await flush();
    expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
  });
});
