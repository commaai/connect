import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { createMemoryHistory } from 'history';

import { api } from '../api/backend';
import { createAppStore } from '../store';
import { createInitialState } from '../initialState';
import { webrtcConnectionManager } from '../utils/webrtc';
import { applyUrl, navigateTo, onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal()),
  checkLastRoutesData: vi.fn(() => ({ type: 'TEST_ROUTES' })),
  checkRoutesData: vi.fn(() => ({ type: 'TEST_ROUTES' })),
  fetchDeviceOnline: vi.fn(() => ({ type: 'TEST_ONLINE' })),
  primeFetchSubscription: vi.fn(() => ({ type: 'TEST_PRIME' })),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function create(pathname) {
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(pathname));
  const urls = () => history.entries.map((entry) => entry.pathname);
  return { store, urls };
}

beforeEach(() => vi.clearAllMocks());

describe('url handling', () => {
  it('applies every location change', () => {
    const dispatch = vi.fn();
    const next = vi.fn(() => 'next result');
    const action = { type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname: `/${DONGLE}` } } };
    expect(onHistoryMiddleware({ dispatch })(next)(action)).toBe('next result');
    expect(next).toHaveBeenCalledWith(action);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('keeps the device data until another device is opened', () => {
    const { store } = create(`/${DONGLE}`);
    store.dispatch(applyUrl(`/${DONGLE}/prime`));
    expect(store.getState()).toMatchObject({ dongleId: DONGLE, page: 'prime' });
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();

    store.dispatch(applyUrl(`/${OTHER}/settings`));
    expect(store.getState()).toMatchObject({ dongleId: OTHER, page: 'settings' });
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('loops over a zoomed drive', () => {
    const { store } = create(`/${DONGLE}`);
    store.dispatch(applyUrl(`/${DONGLE}/${LOG}/10/20`));
    expect(store.getState()).toMatchObject({
      page: 'drive',
      selectedRouteId: LOG,
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    });
  });

  it('navigates by changing the URL only', () => {
    const { store, urls } = create(`/${DONGLE}`);
    store.dispatch(navigateTo({ page: 'dashboard' }));
    store.dispatch(navigateTo({ page: 'stream' }));
    expect(urls()).toEqual([`/${DONGLE}`, `/${DONGLE}/stream`]);
    expect(store.getState().page).toBe('dashboard');

    store.dispatch(navigateTo({ page: 'drive', logId: LOG }, { replace: true }));
    expect(urls()).toEqual([`/${DONGLE}`, `/${DONGLE}/${LOG}`]);
  });

  it('replaces a legacy range with its drive', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store, urls } = create(`/${DONGLE}/1000/2000`);
    store.dispatch(applyUrl(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(urls()).toEqual([`/${DONGLE}/${LOG}`]));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('keeps a legacy range when the lookup fails', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, urls } = create(`/${DONGLE}/1000/2000`);
    store.dispatch(applyUrl(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(urls()).toEqual([`/${DONGLE}/1000/2000`]);
    expect(store.getState().page).toBe('dashboard');
    consoleError.mockRestore();
  });
});
