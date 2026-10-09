import { vi } from 'vitest';
import { replace } from 'connected-react-router';

import { api } from '../api/backend';
import { applyUrl } from './history';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: () => true },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
// the real store imports this module back (via actions -> utils -> timeline -> store)
vi.mock('../store', () => ({ default: {} }));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const LEGACY = `/${DONGLE}/1000/2000`;
const route = { log_id: LOG, duration: 60000 };
const filter = { start: 0, end: 1 };

// a thunk-running store whose state is the URL already applied, with routes loaded
function createStore(pathname, applied = {}) {
  const state = {
    router: { location: { pathname } },
    dongleId: DONGLE, devices: [], limit: 5, filter,
    routes: [route], routesMeta: { dongleId: DONGLE, ...filter },
    selectedRouteId: null, currentRoute: null, zoom: null, loop: null,
    ...applied,
  };
  const actions = [];
  const getState = () => state;
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, getState) : actions.push(action));
  return { state, actions, dispatch };
}

describe('applyUrl', () => {
  it.each([
    ['dashboard', `/${DONGLE}`, {}],
    ['whole drive', `/${DONGLE}/${LOG}`, { selectedRouteId: LOG, currentRoute: route, zoom: { start: 0, end: 60000 } }],
    ['zoomed drive', `/${DONGLE}/${LOG}/10/20`, { selectedRouteId: LOG, currentRoute: route, zoom: { start: 10000, end: 20000 } }],
  ])('changes nothing when the %s URL is already applied', (_name, pathname, applied) => {
    const store = createStore(pathname, applied);
    store.dispatch(applyUrl(pathname));
    expect(store.actions).toEqual([]);
  });

  it.each([
    ['still on the legacy URL', LEGACY, [replace(`/${DONGLE}/${LOG}`)]],
    ['after navigating away', `/${DONGLE}`, []],
  ])('replaces a legacy URL only when %s', async (_name, pathnameAfterLookup, expected) => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = createStore(LEGACY);
    store.dispatch(applyUrl(LEGACY));
    store.state.router.location.pathname = pathnameAfterLookup;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.actions).toEqual(expected);
  });
});
