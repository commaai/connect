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
vi.mock('./index', () => ({
  applyDevice: vi.fn((dongleId) => ({ action: 'applyDevice', dongleId })),
}));
vi.mock('../timeline/playback', () => ({
  resetPlayback: vi.fn(),
  selectLoop: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
};

function create(state = baseState) {
  const store = { getState: vi.fn(() => state) };
  store.dispatch = vi.fn((action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : action));
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE', undefined])('passes through a %s action', (historyAction) => {
    const { next, invoke } = create();
    const action = historyAction ? location(`/${DONGLE}`, historyAction) : { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.applyDevice).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('selects a changed device for %s', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'applyDevice', dongleId: OTHER });
  });

  it.each([
    ['dashboard', `/${DONGLE}`, baseState],
    ['whole route', `/${DONGLE}/${LOG}`, { ...baseState, selectedRouteId: LOG, currentRoute: { duration: 60000 }, zoom: { start: 0, end: 60000 } }],
  ])('does nothing when the pathname already matches the %s in state', (_name, pathname, state) => {
    const { store, invoke } = create(state);
    invoke(location(pathname));
    expect(store.dispatch).toHaveBeenCalledOnce();
  });

  it('enters a log range', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(store.dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: LOG, start: 10000, end: 20000 });
  });

  it('returns to the previous range', () => {
    const { store, invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000, previous: { start: 5000, end: 30000 } } });
    invoke(location(`/${DONGLE}/${LOG}/5/30`));
    expect(store.dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_POP_SELECTION });
  });

  it('leaves a log range', () => {
    const { store, invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).toHaveBeenCalledWith({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null });
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(store.dispatch).toHaveBeenCalledOnce();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatch).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it.each([
    ['Prime', 'prime', Types.ACTION_PRIME_NAV],
    ['stream', 'stream', Types.ACTION_STREAM_NAV],
  ])('activates and deactivates %s through history', (_name, suffix, type) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(entering.store.dispatch).toHaveBeenCalledWith({ type, [`${suffix}Nav`]: true });

    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(leaving.store.dispatch).toHaveBeenCalledWith({ type, [`${suffix}Nav`]: false });
  });
});
