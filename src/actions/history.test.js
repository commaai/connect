import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { onHistoryMiddleware } from './history';
import { fetchDeviceData } from './index';
import * as Types from './types';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchDeviceData: vi.fn(() => ({ type: 'TEST_FETCH_DEVICE_DATA' })),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const ROUTE = { fullname: `${DONGLE}|${LOG}`, log_id: LOG, duration: 60000 };

// what ConnectedRouter dispatches on every history change
const locationChanged = (location, action) => ({ type: LOCATION_CHANGE, payload: { location, action } });

// a store wired to a memory history, the way ConnectedRouter wires the app
function setup(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(pathname));
  history.listen((location, action) => store.dispatch(locationChanged(location, action)));
  store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, routes: [ROUTE] });
  return { history, store, state: () => store.getState() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const next = vi.fn();
    onHistoryMiddleware({ dispatch: vi.fn() })(next)();
    expect(next).not.toHaveBeenCalled();
  });

  it('changes nothing when the URL already matches the state', () => {
    const { history, store } = setup(`/${DONGLE}/${LOG}/10/20`);
    const before = store.getState();
    store.dispatch(locationChanged(history.location, 'POP'));
    const after = store.getState();
    for (const key of ['dongleId', 'selectedRouteId', 'zoom', 'loop', 'page', 'routes', 'offset']) {
      expect(after[key]).toBe(before[key]);
    }
    expect(fetchDeviceData).not.toHaveBeenCalled();
  });

  it('switches device and fetches its data', () => {
    const { history, state } = setup(`/${DONGLE}/${LOG}`);
    history.push(`/${OTHER}`);
    expect(state()).toMatchObject({ dongleId: OTHER, selectedRouteId: null, zoom: null, routes: null });
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(fetchDeviceData).toHaveBeenCalledOnce();
  });

  it('keeps the device and its drives between pages', () => {
    const { history, state } = setup(`/${DONGLE}`);
    const { routes } = state();
    for (const pathname of [`/${DONGLE}/prime`, '/referrals', `/${DONGLE}/settings`, `/${DONGLE}/stream`]) {
      history.push(pathname);
      expect(state().page).toBe(pathname.split('/').pop());
      expect(state()).toMatchObject({ dongleId: DONGLE, routes });
    }
    history.push(`/${DONGLE}`);
    expect(state().page).toBeNull();
    expect(fetchDeviceData).not.toHaveBeenCalled();
  });

  it('selects, zooms and leaves a drive, and back/forward restore each step', () => {
    const { history, state } = setup(`/${DONGLE}`);
    const steps = [
      [`/${DONGLE}/${LOG}`, { selectedRouteId: LOG, zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } }],
      [`/${DONGLE}/${LOG}/10/20`, { selectedRouteId: LOG, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } }],
      [`/${DONGLE}/${LOG}/12/15`, { selectedRouteId: LOG, zoom: { start: 12000, end: 15000 }, loop: { startTime: 12000, duration: 3000 } }],
      [`/${DONGLE}`, { selectedRouteId: null, currentRoute: null, zoom: null, loop: null }],
    ];

    for (const [pathname, expected] of steps) {
      history.push(pathname);
      expect(state()).toMatchObject(expected);
    }
    for (const [, expected] of steps.slice(0, -1).reverse()) {
      history.goBack();
      expect(state()).toMatchObject(expected);
    }
    history.goForward();
    expect(state()).toMatchObject(steps[1][1]);
  });

  it('replaces a legacy timestamp range with its drive', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { history, state } = setup(`/${DONGLE}`);
    history.push(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(history.length).toBe(2);
    expect(state().selectedRouteId).toBe(LOG);
  });

  it.each([
    ['finds no drive', () => api.routes.getRoutesSegments.mockResolvedValue([])],
    ['fails', () => api.routes.getRoutesSegments.mockRejectedValue(new Error('lookup failed'))],
  ])('keeps a legacy range when the lookup %s', async (_name, mockLookup) => {
    mockLookup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { history } = setup(`/${DONGLE}`);
    history.push(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(history.location.pathname).toBe(`/${DONGLE}/1000/2000`);
    consoleError.mockRestore();
  });
});
