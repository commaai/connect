import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { applyUrl, onHistoryMiddleware } from './history';
import { parseUrl } from '../url';
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
  selectDevice: vi.fn(), selectRoute: vi.fn(), checkRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function create(state = { dongleId: DONGLE }) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  store.dispatch.mockImplementation((action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : action));
  return store;
}

function apply(pathname, state) {
  const store = create(state);
  applyUrl(parseUrl(pathname))(store.dispatch, store.getState);
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'selectRoute', 'checkRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const next = vi.fn();
    onHistoryMiddleware(create())(next)();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through', () => {
    const store = create();
    const next = vi.fn(() => 'result');
    expect(onHistoryMiddleware(store)(next)({ type: 'TEST' })).toBe('result');
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies the URL after a %s', (historyAction) => {
    const store = create();
    const next = vi.fn();
    const action = { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname: `/${DONGLE}/${LOG}` } } };
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, null);
  });
});

describe('applyUrl', () => {
  it('selects a changed device before its routes are fetched', () => {
    const store = apply(`/${OTHER}`);
    expect(store.dispatch.mock.calls.map(([action]) => action.action)).toEqual(['selectDevice', 'selectRoute', 'checkRoutesData']);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
  });

  it.each(['/', '/referrals', `/${DONGLE}/prime`])('keeps the device for %s', (pathname) => {
    apply(pathname);
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
  });

  it('selects a drive range', () => {
    apply(`/${DONGLE}/${LOG}/10/20`);
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, { start: 10000, end: 20000 });
  });

  it('replaces a legacy timestamp range with its drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(actions.selectRoute).not.toHaveBeenCalled();
  });

  it.each([null, []])('keeps a legacy range for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const store = apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    await Promise.resolve();
    expect(store.dispatch).toHaveBeenCalledOnce();
  });

  it('keeps a legacy range when the lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(store.dispatch).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
