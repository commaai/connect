import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { currentNav } from '../url';
import { checkRoutesData } from './index';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    devices: { fetchDevice: vi.fn(() => new Promise(() => {})) },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';

function route(logId, dongleId = DONGLE) {
  return {
    fullname: `${dongleId}|${logId}`, url: 'https://routes.example.com',
    segment_numbers: [0], segment_start_times: [1000], segment_end_times: [61000],
    start_time_utc_millis: 1000, end_time_utc_millis: 61000, create_time: 1000,
  };
}

// A store whose history feeds LOCATION_CHANGE like ConnectedRouter does.
function create(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(pathname));
  const onChange = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(onChange);
  onChange(history.location, history.action);
  return { history, store };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// Enter the app at / and navigate to the device, so its routes are loaded.
async function createLoaded(pathname) {
  const app = create('/');
  app.history.push(pathname);
  await flush();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockImplementation(async (dongleId, _start, _end, _limit, routeStr) => (
    routeStr ? [route(routeStr.split('|')[1], dongleId)] : [route(LOG, dongleId), route(OTHER_LOG, dongleId)]
  ));
});

describe('applying the URL', () => {
  it('selects the device of a pushed URL and loads its routes', async () => {
    const { history, store } = create(`/${DONGLE}`);
    history.push(`/${OTHER}`);
    expect(store.getState().dongleId).toBe(OTHER);
    expect(api.routes.getRoutesSegments).toHaveBeenLastCalledWith(OTHER, expect.any(Number), expect.any(Number), 5);
    await flush();
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([LOG, OTHER_LOG]);
  });

  it('keeps the loaded routes when only the page changes', async () => {
    const { history, store } = await createLoaded(`/${DONGLE}`);
    const { routes } = store.getState();
    expect(routes).toHaveLength(2);
    for (const path of [`/${DONGLE}/prime`, '/referrals', `/${DONGLE}/stream`, `/${DONGLE}`]) {
      history.push(path);
      expect(store.getState().routes).toBe(routes);
    }
  });

  it('selects the route and range of a pushed URL', async () => {
    const { history, store } = await createLoaded(`/${DONGLE}`);
    history.push(`/${DONGLE}/${OTHER_LOG}/10/20`);
    expect(store.getState()).toMatchObject({ selectedRouteId: OTHER_LOG, zoom: { start: 10000, end: 20000 } });
    expect(store.getState().loop).toEqual({ startTime: 10000, duration: 10000 });
  });

  it('selects the whole route when the URL has no range', async () => {
    const { history, store } = await createLoaded(`/${DONGLE}`);
    history.push(`/${DONGLE}/${LOG}`);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 0, end: 60000 } });
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 60000 });
  });

  it('pops the zoom stack when going back to the previous range', async () => {
    const { history, store } = await createLoaded(`/${DONGLE}`);
    history.push(`/${DONGLE}/${LOG}`);
    const whole = store.getState().zoom;
    history.push(`/${DONGLE}/${LOG}/10/20`);
    const ranged = store.getState().zoom;
    history.push(`/${DONGLE}/${LOG}/12/15`);
    history.goBack();
    expect(store.getState().zoom).toBe(ranged);
    history.goBack();
    expect(store.getState().zoom).toBe(whole);
  });

  it('loads a pushed route that is not among the loaded routes', async () => {
    const OLD_LOG = '2026-08-01--09-00-00';
    const { history, store } = await createLoaded(`/${DONGLE}`);
    history.push(`/${DONGLE}/${OLD_LOG}`);
    expect(api.routes.getRoutesSegments).toHaveBeenLastCalledWith(DONGLE, undefined, undefined, undefined, `${DONGLE}|${OLD_LOG}`);
    await flush();
    expect(store.getState().currentRoute.log_id).toBe(OLD_LOG);
  });

  it('loads the drive list when a drive is closed before it loaded', async () => {
    const { history, store } = create('/');
    history.push(`/${DONGLE}/${LOG}`);
    history.push(`/${DONGLE}`);
    store.dispatch(checkRoutesData()); // as the drive list does when it mounts
    await flush();
    await flush();
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([LOG, OTHER_LOG]);
  });

  it('leaves the drive for any URL without a route', async () => {
    const { history, store } = await createLoaded(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState()).toMatchObject({ currentRoute: { log_id: LOG }, loop: { startTime: 10000, duration: 10000 } });
    history.push('/referrals');
    expect(store.getState()).toMatchObject({ selectedRouteId: null, currentRoute: null, zoom: null, loop: null });
  });

  it('changes nothing when state already matches the URL', async () => {
    const { history, store } = await createLoaded(`/${DONGLE}/${LOG}/10/20`);
    const state = store.getState();
    expect(state.loop).toEqual({ startTime: 10000, duration: 10000 });
    history.replace(`/${DONGLE}/${LOG}/10/20`);
    expect(store.getState().zoom).toBe(state.zoom);
    expect(store.getState().loop).toBe(state.loop);
  });

  it.each([
    [`/${DONGLE}/prime`, 'prime'],
    [`/${DONGLE}/stream`, 'stream'],
    ['/referrals', 'referrals'],
    [`/${DONGLE}/${LOG}`, 'drive'],
    [`/${DONGLE}`, 'dashboard'],
  ])('reads the page of %s from the URL', (pathname, page) => {
    const { history, store } = create(`/${DONGLE}`);
    history.push(pathname);
    expect(currentNav(store.getState()).page).toBe(page);
  });
});

describe('legacy time range URLs', () => {
  const legacy = `/${DONGLE}/1000/61000`;

  it('are replaced by the route they point at', async () => {
    const { history } = create(legacy);
    await flush();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 61000);
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`);
    expect(history.action).toBe('REPLACE');
  });

  it.each([['empty', async () => []], ['failed', async () => { throw new Error('lookup failed'); }]])('stay for an %s lookup', async (_name, lookup) => {
    api.routes.getRoutesSegments.mockImplementationOnce(lookup);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { history } = create(legacy);
    await flush();
    expect(history.location.pathname).toBe(legacy);
    consoleError.mockRestore();
  });

  it('do not take over a URL that was left before the lookup finished', async () => {
    const { history } = create(legacy);
    history.push(`/${DONGLE}/prime`);
    await flush();
    expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
  });
});
