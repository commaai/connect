import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { api } from '../api/backend';
import { syncLocation } from './history';
import { modalNav, navigate, pushTimelineRange, selectDevice } from './index';
import { seek, pause } from '../timeline/playback';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => true },
  routes: { getRoutesSegments: vi.fn(async () => []) },
} }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../analytics', () => ({ analyticsMiddleware: () => (next) => (action) => next(action) }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const route = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };

function create(pathname = `/${DONGLE}`, extra = {}) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const initial = createInitialState(history.location.pathname);
  const store = createAppStore(history, {
    ...initial,
    devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }],
    device: { dongle_id: DONGLE },
    profile: {},
    limit: 5,
    routes: [route],
    routesMeta: { dongleId: DONGLE, ...initial.filter },
    ...extra,
  });
  history.listen((location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } }));
  store.dispatch(syncLocation());
  return { history, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('URL-driven navigation', () => {
  it('applies PUSH, REPLACE, Back and Forward through the same state transition', () => {
    const { history, store } = create();
    store.dispatch(pushTimelineRange(LOG, 0, 20500));
    expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}/0/20.5`);
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 0, end: 20500 } });
    history.replace(`/${DONGLE}/${LOG}/10/30`);
    expect(store.getState().zoom).toEqual({ start: 10000, end: 30000 });
    history.goBack();
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null });
    history.goForward();
    expect(store.getState().zoom).toEqual({ start: 10000, end: 30000 });
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('keeps loaded route, files, playback and history stable for dialog changes', () => {
    const files = { '0/qlog.bz2': {} };
    const { history, store } = create(`/${DONGLE}/${LOG}`, { files });
    store.dispatch(pause());
    store.dispatch(seek(12345));
    const before = store.getState();
    store.dispatch(modalNav('info'));
    store.dispatch(modalNav('info'));
    expect(history.length).toBe(2);
    expect(history.location.search).toBe('?modal=info');
    for (const key of ['currentRoute', 'routes', 'files', 'zoom', 'loop', 'offset', 'desiredPlaySpeed']) {
      expect(store.getState()[key]).toBe(before[key]);
    }
    history.goBack();
    expect(history.location.search).toBe('');
    expect(store.getState().offset).toBe(12345);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('retains the drive list while opening, closing and reopening a drive', () => {
    const { store } = create();
    const routes = store.getState().routes;
    store.dispatch(pushTimelineRange(LOG, 0, route.duration));
    const loaded = store.getState().currentRoute;
    store.dispatch(navigate(`/${DONGLE}`));
    store.dispatch(pushTimelineRange(LOG, null, null));
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().currentRoute).toBe(loaded);
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
  });

  it('clears device-specific state when a different device is selected', () => {
    const { history, store } = create(`/${DONGLE}/${LOG}`);
    store.dispatch(selectDevice(OTHER));
    expect(history.location.pathname).toBe(`/${OTHER}`);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, selectedRouteId: null, zoom: null, currentRoute: null, routeCache: {} });
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(OTHER, expect.any(Number), expect.any(Number), 5);
  });

  it('replaces a legacy URL without adding a history entry', async () => {
    api.routes.getRoutesSegments.mockResolvedValueOnce([route]);
    const { history, store } = create(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    expect(history.length).toBe(1);
    expect(store.getState().selectedRouteId).toBe(LOG);
  });

  it('ignores a legacy lookup after navigation away', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { history, store } = create(`/${DONGLE}/1000/2000`);
    store.dispatch(navigate(`/${DONGLE}/prime`));
    resolve([route]);
    await Promise.resolve();
    expect(history.location.pathname).toBe(`/${DONGLE}/prime`);
    expect(store.getState().selectedRouteId).toBeNull();
  });
});
