import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { applyUrl, onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), selectDrive: vi.fn(), checkRoutesData: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// a store that runs thunks and records plain actions
function createStore(state) {
  const store = {
    actions: [],
    getState: () => state,
    dispatch: (action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : store.actions.push(action)),
  };
  return store;
}

function apply(pathname, state = {}) {
  const store = createStore({ dongleId: DONGLE, limit: 5, devices: null, router: { location: { pathname } }, ...state });
  store.dispatch(applyUrl(pathname));
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  for (const name of Object.keys(actions)) {
    actions[name].mockImplementation((...args) => ({ type: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const next = vi.fn();
    onHistoryMiddleware(createStore({}))(next)();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through', () => {
    const store = createStore({});
    const next = vi.fn();
    onHistoryMiddleware(store)(next)({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.actions).toEqual([]);
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies the URL after a %s', (historyAction) => {
    const store = createStore({ dongleId: null, limit: 0 });
    const next = vi.fn();
    const action = { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname: `/${DONGLE}` } } };
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(DONGLE);
  });
});

describe('applyUrl', () => {
  it('selects a new device and loads its first routes', () => {
    apply(`/${OTHER}`, { limit: 0 });
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.selectDrive).toHaveBeenCalledWith(null, null);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('reuses the selected device and its routes', () => {
    apply(`/${DONGLE}/prime`);
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/10/20`, { start: 10000, end: 20000 }],
  ])('selects the drive in %s', (pathname, zoom) => {
    apply(pathname);
    expect(actions.selectDrive).toHaveBeenCalledWith(LOG, zoom);
  });

  it('leaves the selected device alone on pages without one', () => {
    const store = apply('/referrals');
    expect(store.actions).toEqual([]);
  });

  it('waits for the device list before leaving /', () => {
    const store = apply('/', { devices: null });
    expect(store.actions).toEqual([]);
  });

  it.each([
    ['the last selected device', OTHER, OTHER],
    ['the first device for an unknown last device', 'dddddddddddddddd', DONGLE],
  ])('opens %s from /', (_name, lastDongleId, expected) => {
    localStorage.setItem('selectedDongleId', lastDongleId);
    const store = apply('/', { devices: [{ dongle_id: DONGLE }, { dongle_id: OTHER }] });
    expect(store.actions).toEqual([replace(`/${expected}`)]);
  });

  it('replaces a legacy time range with the drive at that time', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(store.actions).toContainEqual(replace(`/${DONGLE}/${LOG}`)));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('keeps a legacy time range after navigating away', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = apply(`/${DONGLE}/1000/2000`, { router: { location: { pathname: '/referrals' } } });
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await Promise.resolve();
    expect(store.actions).not.toContainEqual(expect.objectContaining({ payload: expect.anything() }));
  });

  it.each([[null], [[]]])('keeps a legacy time range for an empty lookup (%j)', async (routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const store = apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await Promise.resolve();
    expect(store.actions).not.toContainEqual(expect.objectContaining({ payload: expect.anything() }));
  });

  it('keeps a legacy time range when the lookup fails', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    consoleError.mockRestore();
  });
});
