/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware } from './history';
import * as actions from './index';
import * as Types from './types';

vi.mock('../api', () => ({
  account: {},
  auth: {},
  billing: {},
  devices: { fetchDeviceStats: vi.fn() },
  drives: { getRoutesSegments: vi.fn() },
  raw: {},
  video: {},
}));
vi.mock('./index', () => ({ applyDevice: vi.fn(), checkLastRoutesData: vi.fn(), checkRoutesData: vi.fn() }));
vi.mock('../timeline/playback', () => ({
  reducer: (state) => state,
  resetPlayback: () => ({ action: 'resetPlayback' }),
  selectLoop: (start, end) => ({ action: 'selectLoop', start, end }),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const DURATION = 60000;
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
  router: { location: { pathname: `/${DONGLE}`, search: '' } },
};

function create(initial = baseState) {
  let state = initial;
  const getState = () => state;
  const dispatch = vi.fn((action) => {
    if (typeof action === 'function') return action(dispatch, getState);
    // stand-in for the reducer, which fills a whole drive with {0, duration}
    if (action.type === Types.TIMELINE_PUSH_SELECTION) {
      state = { ...state, zoom: action.log_id ? { start: action.start ?? 0, end: action.end ?? DURATION } : null };
    }
    return action;
  });
  const store = { getState, dispatch };
  const next = vi.fn();
  const invoke = (action) => {
    if (action?.payload) state = { ...state, router: { location: action.payload.location } };
    return onHistoryMiddleware(store)(next)(action);
  };
  const navigateAway = (pathname) => { state = { ...state, router: { location: { pathname, search: '' } } }; };
  return { store, next, invoke, navigateAway };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search: '' } } };
}

const dispatched = (store) => store.dispatch.mock.calls.map(([action]) => action).filter((a) => typeof a !== 'function');

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['applyDevice', 'checkLastRoutesData', 'checkRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through a non-location action', () => {
    const { store, next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE', 'PUSH'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.applyDevice).toHaveBeenCalledWith(OTHER, false);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'applyDevice', args: [OTHER, false] });
  });

  it('does nothing when the pathname already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(dispatched(store)).toEqual([]);
  });

  it('does nothing for an unknown URL', () => {
    const { store, invoke } = create();
    invoke(location('/auth/x/y'));
    expect(dispatched(store)).toEqual([]);
  });

  it('enters a log range', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(dispatched(store)).toContainEqual({ type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 10000, end: 20000 });
    expect(dispatched(store)).toContainEqual({ action: 'selectLoop', start: 10000, end: 20000 });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('loops the applied range of a whole drive, not null', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(dispatched(store)).toContainEqual({ action: 'selectLoop', start: 0, end: DURATION });
  });

  it('leaves a log range', () => {
    const { store, invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(dispatched(store)).toContainEqual({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
  });

  it('pops the zoom stack when going back to the previous range', () => {
    const previous = { start: 10000, end: 20000 };
    const { store, invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 12000, end: 15000, previous } });
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(dispatched(store)).toContainEqual({ type: Types.TIMELINE_POP_SELECTION });
    expect(dispatched(store).map((a) => a.type)).not.toContain(Types.TIMELINE_PUSH_SELECTION);
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('ignores a legacy lookup that resolves after navigating away', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, invoke, navigateAway } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    navigateAway(`/${DONGLE}`);
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(store.dispatch).not.toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`));
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatched(store)).toEqual([]);
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(dispatched(store)).toEqual([]);
    consoleError.mockRestore();
  });

  it.each([
    ['Prime', 'prime', 'primeNav', Types.ACTION_PRIME_NAV],
    ['stream', 'stream', 'streamNav', Types.ACTION_STREAM_NAV],
  ])('activates and deactivates %s through history', (_name, suffix, key, type) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(dispatched(entering.store)).toContainEqual({ type, [key]: true });

    const leaving = create({ ...baseState, [key]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(dispatched(leaving.store)).toContainEqual({ type, [key]: false });
  });
});
