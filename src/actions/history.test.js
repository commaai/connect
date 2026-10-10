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
  loadDevice: vi.fn(), loadTimelineRange: vi.fn(), checkRoutesData: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const LEGACY = `/${DONGLE}/1000/2000`;
const baseState = { dongleId: DONGLE, selectedRouteId: null, router: { location: { pathname: LEGACY } } };

function create(state = baseState) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['loadDevice', 'loadTimelineRange', 'checkRoutesData', 'checkLastRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through other actions', () => {
    const { store, next, invoke } = create();
    invoke({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('loads a new device for %s, then its drive, then its routes', (historyAction) => {
    const { store, next, invoke } = create();
    const action = location(`/${OTHER}/${LOG}/10/20`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch.mock.calls.map(([dispatched]) => dispatched)).toEqual([
      { action: 'loadDevice', args: [OTHER] },
      { action: 'loadTimelineRange', args: [LOG, 10000, 20000] },
      { action: 'checkLastRoutesData', args: [] },
    ]);
  });

  it('keeps the current device', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/prime`));
    expect(store.dispatch.mock.calls).toEqual([[{ action: 'loadTimelineRange', args: [null, undefined, undefined] }]]);
  });

  it('keeps the current device for a path without one', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG });
    invoke(location('/referrals'));
    expect(actions.loadDevice).not.toHaveBeenCalled();
    expect(actions.loadTimelineRange).toHaveBeenCalledWith(null, undefined, undefined);
  });

  it('makes sure the routes of a newly selected drive are loaded', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('replaces a legacy timestamp range with its drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, invoke } = create();
    invoke(location(LEGACY));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('keeps a legacy range when the user navigated away before the lookup finished', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, invoke } = create({ ...baseState, router: { location: { pathname: `/${DONGLE}` } } });
    invoke(location(LEGACY));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`));
  });

  it.each([null, []])('keeps a legacy range for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { store, invoke } = create();
    invoke(location(LEGACY));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: replace('/').type }));
  });

  it('keeps a legacy range when the lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, invoke } = create();
    invoke(location(LEGACY));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: replace('/').type }));
    consoleError.mockRestore();
  });
});
