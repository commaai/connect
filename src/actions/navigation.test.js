import { createMemoryHistory } from 'history';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { createInitialState } from '../initialState';
import { createAppStore } from '../store';
import { parseUrl } from '../url';
import { checkRoutesData } from './index';
import { ACTION_SELECT_TIME_FILTER, ACTION_UPDATE_ROUTE_LIMIT } from './types';

vi.mock('../api/backend', () => ({ api: {
  auth: { isAuthenticated: () => false },
  routes: { getRoutesSegments: vi.fn() },
} }));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';
const DRIVE = `/${FIRST}/${LOG}`;
const START = Date.UTC(2026, 7, 6, 12);

function route(dongleId = FIRST, logId = LOG) {
  return {
    fullname: `${dongleId}|${logId}`, dongle_id: dongleId, create_time: START,
    start_time_utc_millis: START, end_time_utc_millis: START + 60000,
    segment_start_times: [START], segment_end_times: [START + 60000], segment_numbers: [0],
    url: 'https://routes.example.com', distance: 1,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Drain the mocked API/metadata promise chains; no wall-clock timers or network.
async function settle() {
  // Each await advances a dependent promise chain; parallel waits cannot do so.
  // eslint-disable-next-line no-await-in-loop
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function app(pathname = `/${FIRST}`, { entries = [pathname], index = entries.length - 1, selected = FIRST } = {}) {
  const history = createMemoryHistory({ initialEntries: entries, initialIndex: index });
  const initial = createInitialState(history.location.pathname, history.location.search);
  const store = createAppStore(history, { ...initial, dongleId: initial.dongleId || selected, limit: 5 });
  const publish = (location, action) => store.dispatch({ type: LOCATION_CHANGE, payload: { location, action } });
  history.listen(publish);
  publish(history.location, history.action);
  store.dispatch(checkRoutesData()); // Initial entry also loads through startup.
  return { history, store };
}

beforeEach(() => {
  api.routes.getRoutesSegments.mockReset().mockImplementation(async (dongleId, _start, _end, _limit, fullname) => (
    fullname ? [route(dongleId, fullname.split('|')[1])] : [route(dongleId, OTHER_LOG)]
  ));
});
afterEach(() => localStorage.clear());

describe('asynchronous navigation ownership', () => {
  it('starts the new drive immediately and ignores an older same-device response', async () => {
    const old = deferred();
    const next = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { history, store } = app(DRIVE);
    history.push(`/${FIRST}/${OTHER_LOG}`);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    next.resolve([route(FIRST, OTHER_LOG)]);
    await settle();
    const accepted = store.getState().routes;
    old.resolve([route()]);
    await settle();
    expect(store.getState().routes).toBe(accepted);
    expect(store.getState().currentRoute.log_id).toBe(OTHER_LOG);
    expect(history.location.pathname).toBe(`/${FIRST}/${OTHER_LOG}`);
  });

  it('an obsolete rejection cannot release the newer request', async () => {
    const old = deferred();
    const next = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const { history, store } = app(DRIVE);
    history.push(`/${FIRST}/${OTHER_LOG}`);
    old.reject(new Error('obsolete request'));
    await settle();
    const pending = store.dispatch(checkRoutesData());
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    next.resolve([route(FIRST, OTHER_LOG)]);
    await pending;
    expect(store.getState().currentRoute.log_id).toBe(OTHER_LOG);
  });

  it('deduplicates within a store without sharing a request between stores', async () => {
    const firstRequest = deferred();
    const secondRequest = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise);
    const first = app(DRIVE);
    const second = app(DRIVE);
    const firstPending = first.store.dispatch(checkRoutesData());
    expect(first.store.dispatch(checkRoutesData())).toBe(firstPending);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    firstRequest.resolve([route()]);
    await settle();
    expect(first.store.getState().currentRoute.log_id).toBe(LOG);
    expect(second.store.getState().currentRoute).toBeNull();
    secondRequest.resolve([route()]);
    await settle();
    expect(second.store.getState().currentRoute.log_id).toBe(LOG);
  });

  it('closing a pending drive loads the dashboard and rejects stale drive metadata', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise);
    const { history, store } = app(DRIVE);
    history.push(`/${FIRST}`);
    await settle();
    const dashboard = store.getState().routes;
    old.resolve([route()]);
    await settle();
    expect(store.getState().routes).toBe(dashboard);
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([OTHER_LOG]);
    expect(store.getState().selectedRouteId).toBeNull();
    expect(store.getState().currentRoute).toBeNull();
  });

  it('a single fetched drive does not masquerade as a complete dashboard', async () => {
    const { history, store } = app(DRIVE);
    await settle();
    history.push(`/${FIRST}`);
    await settle();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
    expect(store.getState().routes.map((r) => r.log_id)).toEqual([OTHER_LOG]);
  });

  it('switching devices ignores late responses from the old device', async () => {
    const old = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise);
    const { history, store } = app(DRIVE);
    history.push(`/${SECOND}/${OTHER_LOG}`);
    await settle();
    old.resolve([route()]);
    await settle();
    expect(store.getState().currentRoute.fullname).toBe(`${SECOND}|${OTHER_LOG}`);
    expect(store.getState().routesMeta.dongleId).toBe(SECOND);
  });

  it.each(['filter', 'limit'])('an old %s request cannot replace the newer dashboard', async (change) => {
    const old = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(old.promise);
    const { store } = app();
    store.dispatch(change === 'filter'
      ? { type: ACTION_SELECT_TIME_FILTER, start: START, end: START + 60000 }
      : { type: ACTION_UPDATE_ROUTE_LIMIT, limit: 10 });
    await store.dispatch(checkRoutesData());
    const dashboard = store.getState().routes;
    old.resolve([route()]);
    await settle();
    expect(store.getState().routes).toBe(dashboard);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledTimes(2);
  });
});

// Include every major page and every supported dialog, with both devices and
// whole/zero-start/nonzero-start drive ranges. Check all ordered pairs.
const destinations = [
  `/${FIRST}`, `/${SECOND}`, '/referrals', `/${FIRST}/prime`, `/${FIRST}/stream`,
  DRIVE, `/${FIRST}/${OTHER_LOG}`, `${DRIVE}/0/20`, `${DRIVE}/10/20`,
  ...['settings', 'unpair', 'uploads', 'clip', 'clip-delete'].map((modal) => `${DRIVE}?modal=${modal}&device=${FIRST}`),
  `/${FIRST}?modal=date`, `/${FIRST}?modal=pair`,
  `/${FIRST}/prime?modal=prime-cancel`, `/${FIRST}/prime?modal=prime-switch`,
];

function selection(state) {
  return {
    dongleId: state.dongleId, selectedRouteId: state.selectedRouteId,
    route: state.currentRoute?.fullname ?? null,
    zoom: state.zoom && { start: state.zoom.start, end: state.zoom.end }, loop: state.loop,
    prime: state.primeNav, stream: state.streamNav,
    routes: state.routes?.map((r) => r.fullname),
  };
}

describe('major page and dialog transitions', () => {
  const transitions = ['PUSH', 'REPLACE', 'POP'].flatMap((mode) => (
    destinations.flatMap((from) => destinations.map((to) => [mode, from, to]))
  ));
  it.each(transitions)('%s: %s -> %s agrees with direct entry', async (mode, from, to) => {
    const { history, store } = app(from, mode === 'POP' ? { entries: [to, from] } : {});
    await settle();
    const before = store.getState();
    const count = api.routes.getRoutesSegments.mock.calls.length;
    const entries = history.entries.length;
    if (mode === 'POP') history.goBack();
    else if (mode === 'REPLACE') history.replace(to);
    else history.push(to);
    await settle();
    const after = store.getState();
    const url = parseUrl(history.location.pathname, history.location.search);
    expect(history.location.pathname + history.location.search).toBe(to);
    expect(after.selectedRouteId).toBe(url.logId);
    expect(after.primeNav).toBe(url.page === 'prime');
    expect(after.streamNav).toBe(url.page === 'stream');
    expect(history.entries.length).toBe(entries + (mode === 'PUSH' ? 1 : 0));
    const requests = api.routes.getRoutesSegments.mock.calls.slice(count).map((args) => JSON.stringify(args));
    expect(new Set(requests).size).toBe(requests.length);
    // Only query-only transitions promise object identity and no refetch.
    /* eslint-disable vitest/no-conditional-expect */
    if (history.location.pathname === before.router.location.pathname) {
      for (const key of ['currentRoute', 'routes', 'zoom', 'loop', 'files']) expect(after[key]).toBe(before[key]);
      expect(after.offset).toBe(before.offset);
      expect(after.desiredPlaySpeed).toBe(before.desiredPlaySpeed);
      expect(requests).toEqual([]);
    }
    /* eslint-enable vitest/no-conditional-expect */
    const fresh = app(to, { selected: after.dongleId });
    await settle();
    expect(selection(after)).toEqual(selection(fresh.store.getState()));
  });
});
