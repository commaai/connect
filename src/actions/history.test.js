import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { parseLocation } from '../url';
import { hardNavigate } from '../utils/navigation';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', async () => {
  const { selectBackendType } = await vi.importActual('../api/backend');
  return { selectBackendType, api: { routes: { getRoutesSegments: vi.fn() } } };
});
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(),
  checkLastRoutesData: vi.fn(), checkRoutesData: vi.fn(), primeNav: vi.fn(), streamNav: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-07--12-00-00';

function location(pathname, action = 'POP', extra = {}) {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search: '', hash: '', key: pathname, ...extra } } };
}

function create(pathname = `/${DONGLE}`, overrides = {}) {
  const initialLocation = location(pathname).payload.location;
  const navigation = parseLocation(initialLocation);
  let state = {
    navigation,
    router: { location: initialLocation },
    dongleId: navigation.dongleId || DONGLE,
    zoom: navigation.zoom,
    selectedRouteId: navigation.routeId,
    primeNav: navigation.page === 'prime',
    streamNav: navigation.page === 'stream',
    limit: 5,
    ...overrides,
  };
  const store = {
    getState: vi.fn(() => state),
    dispatch: vi.fn((action) => {
      // Model synchronous internal updates so a stale pre-selection snapshot
      // cannot satisfy the cross-device mode regression tests.
      if (action.action === 'selectDevice') {
        state = { ...state, dongleId: action.args[0], selectedRouteId: null, zoom: null, primeNav: false, streamNav: false, limit: 0 };
      } else if (action.action === 'primeNav' || action.action === 'streamNav') {
        state = { ...state, [action.action]: action.args[0] };
      } else if (action.action === 'pushTimelineRange') {
        const [routeId, start, end] = action.args;
        state = { ...state, selectedRouteId: routeId, zoom: start === null ? null : { start, end } };
      }
      return action;
    }),
  };
  const next = vi.fn((action) => {
    if (action.type === LOCATION_CHANGE) {
      state = { ...state, navigation: action.payload.navigation, router: { location: action.payload.location } };
    }
    return action;
  });
  const invoke = onHistoryMiddleware(store)(next);
  return { store, next, invoke };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const legacyRoute = (dongleId = DONGLE, routeId = LOG) => [{ fullname: `${dongleId}|${routeId}` }];
const canonicalRoute = (routeId = LOG, extra = {}) => replace({ pathname: `/${DONGLE}/${routeId}`, search: '', hash: '', ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  api.routes.getRoutesSegments.mockReset();
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkLastRoutesData', 'checkRoutesData', 'primeNav', 'streamNav']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action and preserves other middleware return values', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
    const action = { type: 'TEST' };
    expect(invoke(action)).toBe(action);
    expect(next).toHaveBeenCalledWith(action);
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('reconciles a changed device for %s from the parsed location', (historyAction) => {
    const { store, next, invoke } = create();
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith({ ...action, payload: { ...action.payload, navigation: parseLocation(action.payload.location) } });
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ dongleId: OTHER, navigation: { page: 'device', dongleId: OTHER } });
    expect(next.mock.invocationCallOrder[0]).toBeLessThan(actions.selectDevice.mock.invocationCallOrder[0]);
  });

  it('does not reset selection when the same location is replayed', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    [`/${DONGLE}`, '/demo'],
    ['/demo', `/${DONGLE}`],
    [`/${DONGLE}`, '/deadbeefdeadbeef'],
    ['/deadbeefdeadbeef', '/referrals'],
  ])('reloads across the backend boundary from %s to %s', (from, to) => {
    const { store, invoke } = create(from);
    invoke(location(to, 'PUSH', { search: '?dialog=add-device', hash: '#details' }));
    expect(hardNavigate).toHaveBeenCalledWith(`${to}?dialog=add-device#details`);
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(store.getState().router.location.pathname).toBe(to);
  });

  it('does not reload a cold demo entry or navigation within its backend', () => {
    const { invoke } = create('/demo');
    invoke(location('/demo'));
    invoke(location('/deadbeefdeadbeef', 'PUSH'));
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('selects and fetches a same-device route for %s', (historyAction) => {
    const { store, invoke } = create(`/${DONGLE}/${LOG}`);
    invoke(location(`/${DONGLE}/${OTHER_LOG}/0/20`, historyAction));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(OTHER_LOG, 0, 20000, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.getState()).toMatchObject({ selectedRouteId: OTHER_LOG, zoom: { start: 0, end: 20000 } });
  });

  it('clears the route and requests dashboard data when closing a drive', () => {
    const { invoke } = create(`/${DONGLE}/${LOG}/10/20`);
    invoke(location(`/${DONGLE}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('starts the dashboard with a nonzero request limit after closing a cold-opened drive', () => {
    const { invoke } = create(`/${DONGLE}/${LOG}`, { limit: 0 });
    invoke(location(`/${DONGLE}`));
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
  });

  it('changes the range without refetching the same route', () => {
    const { invoke } = create(`/${DONGLE}/${LOG}/10/20`);
    invoke(location(`/${DONGLE}/${LOG}/20/30`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 20000, 30000, false);
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it.each(['/', '/referrals', '/auth', '/unknown'])('clears device views at %s while retaining device context', (pathname) => {
    const { store, invoke } = create(`/${DONGLE}/${LOG}`, { primeNav: true, streamNav: true });
    invoke(location(pathname));
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.primeNav).toHaveBeenCalledWith(false, false);
    expect(actions.streamNav).toHaveBeenCalledWith(false, false);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
    expect(store.getState().dongleId).toBe(DONGLE);
  });

  it.each(['prime', 'stream'])('restores %s after selecting a different device in the same mode', (mode) => {
    const { store, invoke } = create(`/${DONGLE}/${mode}`);
    invoke(location(`/${OTHER}/${mode}`));
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions[`${mode}Nav`]).toHaveBeenCalledWith(true, false);
    expect(store.getState()).toMatchObject({ dongleId: OTHER, [`${mode}Nav`]: true });
  });

  it.each(['prime', 'stream'])('deactivates %s without overwriting a drive destination', (mode) => {
    const { store, invoke } = create(`/${DONGLE}/${mode}`);
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions[`${mode}Nav`]).toHaveBeenCalledWith(false, false);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
    expect(store.getState().router.location.pathname).toBe(`/${DONGLE}/${LOG}/10/20`);
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('preserves playback for dialog and query-only %s navigation', (historyAction) => {
    const pathname = `/${DONGLE}/${LOG}/10/20`;
    const { store, invoke } = create(pathname, { offset: 15000, desiredPlaySpeed: 0.5 });
    invoke(location(pathname, historyAction, { search: '?dialog=files&share=token', hash: '#details', key: 'dialog' }));
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ offset: 15000, desiredPlaySpeed: 0.5, navigation: { dialog: 'files' } });
  });

  it('replaces a legacy URL using its captured device and retains unrelated query and hash', async () => {
    api.routes.getRoutesSegments.mockResolvedValue(legacyRoute());
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`, 'POP', { search: '?share=token', hash: '#details' }));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(canonicalRoute(LOG, { search: '?share=token', hash: '#details' })));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it.each([null, [], legacyRoute(OTHER)])('does not convert an empty or mismatched legacy result (%j)', async (routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each([`/${OTHER}`, `/${DONGLE}/${OTHER_LOG}`, '/referrals'])('ignores a legacy response after navigation to %s', async (destination) => {
    const request = deferred();
    api.routes.getRoutesSegments.mockReturnValue(request.promise);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    invoke(location(destination, 'PUSH'));
    store.dispatch.mockClear();
    request.resolve(legacyRoute());
    await request.promise;
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(store.getState().router.location.pathname).toBe(destination);
  });

  it('uses only the newest legacy lookup when navigation returns to the same history entry', async () => {
    const first = deferred();
    const second = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { store, invoke } = create();
    const legacy = location(`/${DONGLE}/1000/2000`);
    invoke(legacy);
    invoke(location('/referrals', 'PUSH'));
    invoke(legacy);
    store.dispatch.mockClear();
    first.resolve(legacyRoute());
    await first.promise;
    expect(store.dispatch).not.toHaveBeenCalled();
    second.resolve(legacyRoute(DONGLE, OTHER_LOG));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(canonicalRoute(OTHER_LOG)));
  });

  it('keeps a legacy range unchanged when its lookup rejects', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatch).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
