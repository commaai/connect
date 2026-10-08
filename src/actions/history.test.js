/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware } from './history';
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
const baseState = {
  routes: [], filter: { start: 0, end: 1 }, routesMeta: { dongleId: DONGLE, start: 0, end: 1 },
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
};

function create(state = baseState) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const invoke = onHistoryMiddleware(store)(next);
  return { store, next, invoke };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it.each(['POP', 'REPLACE', 'PUSH'])('selects a changed device for %s and refreshes routes', (historyAction) => {
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
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false, true);
  });

  it('leaves a log range', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false, true);
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke, store } = create();
    const requested = location(`/${DONGLE}/1000/2000`);
    invoke(requested);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace({ ...requested.payload.location, pathname: `/${DONGLE}/${LOG}` })));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['Prime', 'prime', 'primeNav'],
    ['stream', 'stream', 'streamNav'],
  ])('activates and deactivates %s through history', (_name, suffix, actionName) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });

  it('drops a legacy lookup after a newer pathname', async () => {
    let resolveLookup;
    Drives.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { invoke, store } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    invoke(location(`/${DONGLE}`));
    resolveLookup([{ fullname: `${DONGLE}|${LOG}` }]);
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: '@@router/CALL_HISTORY_METHOD' }));
  });

  it('reuses a pending legacy lookup through query-only navigation', async () => {
    let resolveLookup;
    Drives.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { invoke, store } = create();
    const pathname = `/${DONGLE}/1000/2000`;
    invoke(location(pathname));
    const latestLocation = { pathname, search: '?ci=1' };
    store.getState.mockReturnValue({ ...baseState, router: { location: latestLocation } });
    invoke({ ...location(pathname, 'PUSH'), payload: { action: 'PUSH', location: latestLocation } });
    resolveLookup([{ fullname: `${DONGLE}|${LOG}` }]);
    await Promise.resolve();
    expect(Drives.getRoutesSegments).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenCalledWith(replace({ pathname: `/${DONGLE}/${LOG}`, search: '?ci=1' }));
  });

  it('preserves subsecond selection through modal navigation at URL precision', () => {
    const { invoke, store } = create({ ...baseState, selectedRouteId: LOG,
      routes: [{ log_id: LOG, duration: 60000 }], zoom: { start: 10123, end: 20999 } });
    invoke({ ...location(`/${DONGLE}/${LOG}/10/20`, 'PUSH'),
      payload: { action: 'PUSH', location: { pathname: `/${DONGLE}/${LOG}/10/20`, search: '?modal=settings' } } });
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
