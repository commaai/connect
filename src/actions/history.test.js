import { vi } from 'vitest';
import { CALL_HISTORY_METHOD, LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware, syncStateToUrl } from './history';
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
  setDevice: vi.fn(), selectRoute: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const LEGACY = `/${DONGLE}/1000/2000`;
const NAVIGATION = expect.objectContaining({ type: CALL_HISTORY_METHOD });
const baseState = { dongleId: DONGLE, zoom: null, selectedRouteId: null, routes: null, router: { location: { pathname: LEGACY } } };

// Returns the actions dispatched while syncing, by name.
function sync(pathname, state = baseState) {
  const dispatch = vi.fn();
  syncStateToUrl(pathname)(dispatch, () => state);
  return { dispatch, names: dispatch.mock.calls.map(([action]) => action.action ?? 'resolveLegacyRange') };
}

async function resolveLegacy(state = baseState) {
  const { dispatch } = sync(LEGACY, state);
  dispatch.mock.calls[0][0](dispatch, () => state);
  await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return dispatch;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['setDevice', 'selectRoute', 'checkLastRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('syncStateToUrl', () => {
  it.each([`/${DONGLE}`, '/referrals', `/${DONGLE}/prime`, `/${DONGLE}/stream`])('keeps state for %s', (pathname) => {
    expect(sync(pathname).names).toEqual([]);
  });

  it('switches device, then selects the drive before fetching routes', () => {
    const { names } = sync(`/${OTHER}/${LOG}`);
    expect(names).toEqual(['setDevice', 'selectRoute', 'checkLastRoutesData']);
    expect(actions.setDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, null);
  });

  it('enters a zoomed drive', () => {
    sync(`/${DONGLE}/${LOG}/10/20`);
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, { start: 10000, end: 20000 });
  });

  it('leaves a drive', () => {
    sync(`/${DONGLE}`, { ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
  });

  it.each([
    ['a sub-second zoom', { start: 10400, end: 20900 }, `/${DONGLE}/${LOG}/10/20`],
    ['a whole-drive zoom', { start: 0, end: 60000 }, `/${DONGLE}/${LOG}`],
  ])('reuses %s that the URL rounds to', (_name, zoom, pathname) => {
    const state = { ...baseState, selectedRouteId: LOG, zoom, routes: [{ log_id: LOG, duration: 60000 }] };
    expect(sync(pathname, state).names).toEqual([]);
  });

  it('replaces a legacy timestamp URL with its drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    expect(await resolveLegacy()).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`));
  });

  it('ignores a legacy lookup that finishes after navigating away', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatch = await resolveLegacy({ ...baseState, router: { location: { pathname: '/referrals' } } });
    expect(dispatch).not.toHaveBeenCalledWith(NAVIGATION);
  });

  it.each([null, []])('keeps a legacy URL when the lookup finds nothing (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    expect(await resolveLegacy()).not.toHaveBeenCalledWith(NAVIGATION);
  });

  it('keeps a legacy URL when the lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatch = await resolveLegacy();
    expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error);
    expect(dispatch).not.toHaveBeenCalledWith(NAVIGATION);
    consoleError.mockRestore();
  });
});

describe('history middleware', () => {
  it.each(['PUSH', 'POP', 'REPLACE'])('syncs state after a %s', (historyAction) => {
    const store = { dispatch: vi.fn() };
    const next = vi.fn();
    const action = { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname: `/${OTHER}` } } };
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('passes other actions through', () => {
    const store = { dispatch: vi.fn() };
    const next = vi.fn();
    onHistoryMiddleware(store)(next)({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
