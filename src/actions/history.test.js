/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { CALL_HISTORY_METHOD, LOCATION_CHANGE } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware, resetLegacyGeneration } from './history';
import * as actions from './index';

vi.mock('../api', () => ({
  account: {},
  auth: {},
  billing: {},
  devices: { fetchDeviceStats: vi.fn() },
  drives: { getRoutesSegments: vi.fn() },
  raw: {},
  video: {},
}));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(),
  checkRoutesData: vi.fn(), primeNav: vi.fn(), streamNav: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const OTHER_LOG = '2026-08-06--13-00-00';
const LEGACY_PATH = `/${DONGLE}/1000/2000`;

const routerAt = (pathname, search = '') => ({ location: { pathname, search } });
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
  router: routerAt(`/${DONGLE}`),
};

function create(state = baseState) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke, state };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

const replaceAction = (descriptor) => ({
  type: CALL_HISTORY_METHOD,
  payload: { method: 'replace', args: [descriptor] },
});

beforeEach(() => {
  vi.clearAllMocks();
  resetLegacyGeneration();
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkRoutesData', 'primeNav', 'streamNav']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['PUSH', undefined])('passes through a non-history %s action', (historyAction) => {
    const { next, invoke } = create();
    const action = historyAction ? location(`/${DONGLE}`, historyAction) : { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, false, false] });
  });

  it('does nothing when the pathname already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('enters a log range', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
  });

  it('enters a log range that starts at second zero', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/0/20`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 0, 20000, false);
  });

  it('leaves a log range', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  });

  it('converts a legacy timestamp range to a route with a replace', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, invoke } = create({ ...baseState, router: routerAt(LEGACY_PATH) });
    invoke(location(LEGACY_PATH));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(
      replaceAction({ pathname: `/${DONGLE}/${LOG}`, search: '' }),
    ));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('clears an open drive on a same-dongle legacy range', () => {
    const { invoke } = create({
      ...baseState,
      selectedRouteId: LOG,
      zoom: { start: 10000, end: 20000 },
      router: routerAt(LEGACY_PATH),
    });
    invoke(location(LEGACY_PATH));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  });

  it.each([['null', null], ['empty', []]])('keeps a legacy range unchanged for a %s lookup', async (_label, routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create({ ...baseState, router: routerAt(LEGACY_PATH) });
    invoke(location(LEGACY_PATH));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create({ ...baseState, router: routerAt(LEGACY_PATH) });
    invoke(location(LEGACY_PATH));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatch).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('drops a legacy response that resolves after another navigation', async () => {
    let resolveLookup;
    Drives.getRoutesSegments.mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
    const { store, invoke, state } = create({ ...baseState, router: routerAt(LEGACY_PATH) });
    invoke(location(LEGACY_PATH));
    invoke(location(`/${OTHER}`));
    state.router.location = { pathname: `/${OTHER}`, search: '' }; // the router reducer stored the new location
    resolveLookup([{ fullname: `${DONGLE}|${LOG}` }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.dispatch).not.toHaveBeenCalledWith(replaceAction({ pathname: `/${DONGLE}/${LOG}`, search: '' }));
  });

  it('drops the first lookup when the same legacy range is requested again', async () => {
    const resolvers = [];
    Drives.getRoutesSegments.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));
    const { store, invoke } = create({ ...baseState, router: routerAt(LEGACY_PATH) });
    invoke(location(LEGACY_PATH));
    invoke(location(LEGACY_PATH), 'REPLACE'); // a second conversion bumps the generation
    resolvers[0]([{ fullname: `${DONGLE}|${OTHER_LOG}` }]); // stale response arrives late
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.dispatch).not.toHaveBeenCalledWith(replaceAction({ pathname: `/${DONGLE}/${OTHER_LOG}`, search: '' }));
    resolvers[1]([{ fullname: `${DONGLE}|${LOG}` }]);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(
      replaceAction({ pathname: `/${DONGLE}/${LOG}`, search: '' }),
    ));
  });

  it('logs a stale legacy rejection at debug level, not error', async () => {
    let rejectLookup;
    Drives.getRoutesSegments.mockImplementation(() => new Promise((_resolve, reject) => { rejectLookup = reject; }));
    const { invoke, state } = create({ ...baseState, router: routerAt(LEGACY_PATH) });
    invoke(location(LEGACY_PATH));
    invoke(location(`/${OTHER}`));
    state.router.location = { pathname: `/${OTHER}`, search: '' }; // the router reducer stored the new location
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    rejectLookup(new Error('lookup failed'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleDebug).toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleDebug.mockRestore();
    consoleError.mockRestore();
  });

  it('converts a legacy range while primeNav is true without rewriting the path first', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, invoke, state } = create({ ...baseState, primeNav: true, router: routerAt(LEGACY_PATH) });
    actions.primeNav.mockImplementation((nav, allowPathChange = true) => {
      if (nav === false && allowPathChange === true) {
        state.router.location = { pathname: `/${DONGLE}`, search: '' };
      }
      return { action: 'primeNav', args: [nav, allowPathChange] };
    });
    invoke(location(LEGACY_PATH));
    expect(actions.primeNav).toHaveBeenCalledWith(false, false);
    expect(state.router.location.pathname).toBe(LEGACY_PATH);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(
      replaceAction({ pathname: `/${DONGLE}/${LOG}`, search: '' }),
    ));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([
    ['Prime', 'prime', 'primeNav'],
    ['stream', 'stream', 'streamNav'],
  ])('activates and deactivates %s through history without path writes', (_name, suffix, actionName) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });
});
