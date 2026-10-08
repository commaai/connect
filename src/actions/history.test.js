import { vi } from 'vitest';
import { createMemoryHistory } from 'history';

import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import * as Types from './types';
import { navigateTo, navigateToDrive } from './history';

const mocks = vi.hoisted(() => ({ getRoutesSegments: vi.fn(), disconnect: vi.fn() }));

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    routes: { getRoutesSegments: mocks.getRoutesSegments },
    devices: { fetchDevice: vi.fn(async () => ({})) },
  },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: mocks.disconnect } }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const ROUTE = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };

function create(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState());
  const actions = [];
  const { dispatch } = store;
  store.dispatch = (action) => {
    if (action?.type) actions.push(action.type);
    return dispatch(action);
  };
  // ConnectedRouter reports the first location when it mounts
  store.dispatch({ type: '@@router/LOCATION_CHANGE', payload: { location: history.location, action: 'POP' } });
  history.listen((location, action) => store.dispatch({ type: '@@router/LOCATION_CHANGE', payload: { location, action } }));
  return { history, store, actions };
}

function withRoutes({ store }) {
  store.dispatch({ type: Types.ACTION_ROUTES_METADATA, dongleId: DONGLE, start: 0, end: 1, routes: [ROUTE] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('URL to state', () => {
  it.each([
    [`/${DONGLE}`, { dongleId: DONGLE, selectedRouteId: null, zoom: null }],
    [`/${DONGLE}/prime`, { dongleId: DONGLE, selectedRouteId: null, zoom: null }],
    [`/${DONGLE}/${LOG}`, { dongleId: DONGLE, selectedRouteId: LOG, zoom: null }],
    [`/${DONGLE}/${LOG}/10/20`, { dongleId: DONGLE, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } }],
    ['/referrals', { dongleId: null, selectedRouteId: null }],
    ['/demo', { dongleId: null, selectedRouteId: null }],
  ])('first load of %s', (pathname, expected) => {
    const { store } = create(pathname);
    expect(store.getState()).toMatchObject(expected);
  });

  it('keeps the device and its drives when only the page changes', () => {
    const app = create(`/${DONGLE}`);
    withRoutes(app);
    app.actions.length = 0;

    app.history.push(`/${DONGLE}/${LOG}`);
    app.history.push(`/${DONGLE}/settings`);
    app.history.push(`/${DONGLE}`);

    expect(app.actions).not.toContain(Types.ACTION_SELECT_DEVICE);
    expect(app.store.getState().routes).toEqual([ROUTE]);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('selects a device and drops the previous one\'s drives', () => {
    const app = create(`/${DONGLE}/${LOG}`);
    withRoutes(app);

    app.history.push(`/${OTHER}`);

    expect(app.store.getState()).toMatchObject({ dongleId: OTHER, routes: null, selectedRouteId: null, zoom: null });
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the device on pages without one', () => {
    const app = create(`/${DONGLE}`);
    app.history.push('/referrals');
    expect(app.store.getState().dongleId).toBe(DONGLE);
  });

  it('applying the same location twice changes nothing', () => {
    const app = create(`/${DONGLE}/${LOG}/10/20`);
    withRoutes(app);
    const state = app.store.getState();
    app.history.replace(`/${DONGLE}/${LOG}/10/20`);
    expect(app.store.getState().zoom).toBe(state.zoom);
  });

  it('going back to a range pops the zoom history instead of growing it', () => {
    const app = create(`/${DONGLE}/${LOG}`);
    withRoutes(app); // the whole drive is selected once its duration is known
    app.history.push(`/${DONGLE}/${LOG}/10/40`);
    app.history.push(`/${DONGLE}/${LOG}/20/30`);

    app.history.goBack();
    expect(app.store.getState().zoom).toMatchObject({ start: 10000, end: 40000, previous: { start: 0, end: 60000 } });
    app.history.goBack();
    expect(app.store.getState().zoom).toEqual({ start: 0, end: 60000 });
  });

  it('redirects a legacy time window to the drive in it', async () => {
    mocks.getRoutesSegments.mockResolvedValue([ROUTE]);
    const app = create(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(app.history.location.pathname).toBe(`/${DONGLE}/${LOG}`));
    expect(app.history.action).toBe('REPLACE');
    expect(mocks.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('does not redirect a legacy link the user already left', async () => {
    let resolve;
    mocks.getRoutesSegments.mockReturnValue(new Promise((r) => { resolve = r; }));
    const app = create(`/${DONGLE}/1000/2000`);
    app.history.push(`/${DONGLE}/prime`);
    resolve([ROUTE]);
    await new Promise((r) => setTimeout(r, 0));
    expect(app.history.location.pathname).toBe(`/${DONGLE}/prime`);
  });

  it.each([[[]], [null]])('keeps a legacy link with no drive in it (%j)', async (routes) => {
    mocks.getRoutesSegments.mockResolvedValue(routes);
    const app = create(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(mocks.getRoutesSegments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(app.history.location.pathname).toBe(`/${DONGLE}/1000/2000`);
  });
});

describe('navigation', () => {
  it.each([
    [['prime'], `/${DONGLE}/prime`],
    [['settings', { dongleId: OTHER }], `/${OTHER}/settings`],
    [['referrals'], '/referrals'],
    [['dashboard'], `/${DONGLE}`],
  ])('navigateTo(%j) goes to %s', (args, pathname) => {
    const app = create(`/${DONGLE}/${LOG}`);
    app.store.dispatch(navigateTo(...args));
    expect(app.history.location.pathname).toBe(pathname);
  });

  it('does not add a history entry for the current page', () => {
    const app = create(`/${DONGLE}`);
    app.store.dispatch(navigateTo('dashboard'));
    expect(app.history.length).toBe(1);
  });

  it.each([
    [[LOG], `/${DONGLE}/${LOG}`],
    [[LOG, 0, 60000], `/${DONGLE}/${LOG}`],
    [[LOG, 0, 30000], `/${DONGLE}/${LOG}/0/30`],
    [[LOG, 10500, 20500], `/${DONGLE}/${LOG}/10/20`],
  ])('navigateToDrive(%j) goes to %s', (args, pathname) => {
    const app = create(`/${DONGLE}`);
    withRoutes(app);
    app.store.dispatch(navigateToDrive(...args));
    expect(app.history.location.pathname).toBe(pathname);
  });
});
