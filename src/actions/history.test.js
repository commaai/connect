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
  setDevice: vi.fn(), selectRoute: vi.fn(), checkRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null,
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
  for (const name of ['setDevice', 'selectRoute', 'checkRoutesData']) {
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
    expect(actions.setDevice).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.setDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'setDevice', args: [OTHER] });
  });

  it('does nothing when the pathname already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('enters a log range', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, 10000, 20000);
  });

  it('leaves a log range', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null, null);
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke, store } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('discards a legacy lookup after navigating away and back to the same URL', async () => {
    let resolveFirst;
    let resolveSecond;
    Drives.getRoutesSegments
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { invoke, store } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    invoke(location(`/${DONGLE}/settings`, 'PUSH'));
    invoke(location(`/${DONGLE}/1000/2000`));
    resolveFirst([{ fullname: `${DONGLE}|2026-08-05--10-00-00` }]);
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalledWith(replace(`/${DONGLE}/2026-08-05--10-00-00`));
    resolveSecond([{ fullname: `${DONGLE}|${LOG}` }]);
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`));
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(actions.selectRoute).not.toHaveBeenCalled();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(actions.selectRoute).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
