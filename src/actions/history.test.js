import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  api: { auth: { isAuthenticated: vi.fn(() => true) }, routes: { getRoutesSegments: vi.fn() } },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('./index', () => ({ checkLastRoutesData: vi.fn(), checkRoutesData: vi.fn(), loadDevice: vi.fn(), openDefaultDevice: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// `next` stands in for the reducers, moving the store from `before` to `after`.
function create(before, after) {
  let state = before;
  const store = { getState: vi.fn(() => state), dispatch: vi.fn((a) => (typeof a === 'function' ? a(store.dispatch, store.getState) : a)) };
  const next = vi.fn(() => { state = after; });
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname) {
  return { type: LOCATION_CHANGE, payload: { action: 'POP', location: { pathname, search: '' } } };
}

const dashboard = (dongleId, extra) => ({ dongleId, page: 'dashboard', router: { location: { pathname: `/${dongleId}` } }, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['checkLastRoutesData', 'checkRoutesData', 'loadDevice', 'openDefaultDevice']) {
    actions[name].mockImplementation((...args) => ({ type: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through', () => {
    const { store, next, invoke } = create(dashboard(DONGLE));
    invoke({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('loads a newly selected device', () => {
    const { store, invoke } = create(dashboard(DONGLE), dashboard(OTHER));
    invoke(location(`/${OTHER}`));
    expect(store.dispatch.mock.calls.map(([a]) => a.type)).toEqual(['loadDevice', 'checkLastRoutesData']);
    expect(actions.loadDevice).toHaveBeenCalledWith(OTHER);
    expect(localStorage.getItem('selectedDongleId')).toBe(OTHER);
  });

  it('sends a URL without a device to the default one', () => {
    const { store, invoke } = create(dashboard(DONGLE), dashboard(null));
    invoke(location('/'));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'openDefaultDevice', args: [] });
    expect(actions.loadDevice).not.toHaveBeenCalled();
  });

  it('fetches nothing when the device and drive are already loaded', () => {
    const state = dashboard(DONGLE, { page: 'drive', selectedRouteId: LOG, currentRoute: {} });
    const { store, invoke } = create(dashboard(DONGLE), state);
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('fetches a drive that is not loaded yet', () => {
    const state = dashboard(DONGLE, { page: 'drive', selectedRouteId: LOG, currentRoute: null });
    const { store, invoke } = create(dashboard(DONGLE), state);
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'checkRoutesData', args: [] });
  });

  it('fetches nothing for a private page while signed out', () => {
    api.auth.isAuthenticated.mockReturnValueOnce(false);
    const { store, invoke } = create(dashboard(null), dashboard(DONGLE));
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('replaces a legacy timestamp URL with its drive', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const pathname = `/${DONGLE}/1000/2000`;
    const { store, invoke } = create(dashboard(DONGLE), dashboard(DONGLE, { page: 'legacy', router: { location: { pathname } } }));
    invoke(location(pathname));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([
    ['empty', () => Promise.resolve([])],
    ['failed', () => Promise.reject(new Error('lookup failed'))],
  ])('keeps a legacy URL after an %s lookup', async (_name, lookup) => {
    api.routes.getRoutesSegments.mockImplementation(lookup);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pathname = `/${DONGLE}/1000/2000`;
    const { store, invoke } = create(dashboard(DONGLE), dashboard(DONGLE, { page: 'legacy', router: { location: { pathname } } }));
    invoke(location(pathname));
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.dispatch.mock.calls.some(([a]) => a.type === '@@router/CALL_HISTORY_METHOD')).toBe(false);
    consoleError.mockRestore();
  });
});
