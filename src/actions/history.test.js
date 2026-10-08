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
vi.mock('./index', () => ({ selectDevice: vi.fn(), selectRoute: vi.fn(), checkRoutesData: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = { dongleId: DONGLE, devices: null };

function create(state = baseState) {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, () => state) : action));
  const next = vi.fn(() => 'next result');
  const invoke = (action) => onHistoryMiddleware({ dispatch, getState: () => state })(next)(action);
  return { dispatch, next, invoke };
}

function location(pathname, action = 'PUSH') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  for (const name of ['selectDevice', 'selectRoute', 'checkRoutesData']) {
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
    const { dispatch, next, invoke } = create();
    expect(invoke({ type: 'TEST' })).toBe('next result');
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies a %s to state after the router', (historyAction) => {
    const { dispatch, next, invoke } = create();
    invoke(location(`/${OTHER}`, historyAction));
    expect(next).toHaveBeenCalledBefore(dispatch);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it.each([
    ['dashboard', `/${DONGLE}`],
    ['settings', `/${DONGLE}/settings`],
    ['Prime', `/${DONGLE}/prime`],
    ['stream', `/${DONGLE}/stream`],
    ['referrals', '/referrals'],
  ])('keeps the device for %s', (_name, pathname) => {
    const { invoke } = create();
    invoke(location(pathname));
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/10/20`, { start: 10000, end: 20000 }],
  ])('selects the drive in %s', (pathname, zoom) => {
    const { invoke } = create();
    invoke(location(pathname));
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, zoom);
  });

  it.each([
    ['the selected device', DONGLE, DONGLE],
    ['the first device', 'ffffffffffffffff', OTHER],
  ])('home shows %s', (_name, selected, expected) => {
    localStorage.setItem('selectedDongleId', selected);
    const { dispatch, invoke } = create({ ...baseState, devices: [{ dongle_id: OTHER }, { dongle_id: DONGLE }] });
    invoke(location('/'));
    expect(dispatch).toHaveBeenCalledWith(replace(`/${expected}`));
    expect(actions.selectRoute).not.toHaveBeenCalled();
  });

  it('home waits for the device list', () => {
    const { dispatch, invoke } = create();
    invoke(location('/'));
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('converts a legacy time range to a drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { dispatch, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([null, []])('keeps a legacy range for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { dispatch, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: '@@router/CALL_HISTORY_METHOD' }));
  });

  it('keeps a legacy range when the lookup fails', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dispatch, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: '@@router/CALL_HISTORY_METHOD' }));
    consoleError.mockRestore();
  });
});
