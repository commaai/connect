import { vi } from 'vitest';
import { CALL_HISTORY_METHOD, LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { navigate, onHistoryMiddleware, syncLocation } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  api: {
    auth: { isAuthenticated: vi.fn() },
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), selectDrive: vi.fn(), checkRoutesData: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const LEGACY = `/${DONGLE}/1000/2000`;

function create(state = {}) {
  const getState = () => ({ dongleId: DONGLE, limit: 5, router: { location: { pathname: `/${DONGLE}` } }, ...state });
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
  return { dispatch, getState };
}

function sync(pathname, state) {
  const { dispatch, getState } = create(state);
  syncLocation(pathname)(dispatch, getState);
  return dispatch;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  api.auth.isAuthenticated.mockReturnValue(true);
  for (const name of Object.keys(actions)) {
    actions[name].mockImplementation((...args) => ({ type: name, args }));
  }
});

describe('syncLocation', () => {
  it('reuses state for the same device', () => {
    const dispatch = sync(`/${DONGLE}/prime`);
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectDrive', args: [null, null] });
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('selects a new device and loads its routes', () => {
    const dispatch = sync(`/${OTHER}`, { limit: 0 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectDevice', args: [OTHER] });
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('selects a drive and its zoom', () => {
    const dispatch = sync(`/${DONGLE}/${LOG}/10/20`, { limit: 0 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectDrive', args: [LOG, { start: 10000, end: 20000 }] });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it.each(['/', '/referrals'])('leaves state alone on %s', (pathname) => {
    expect(sync(pathname)).not.toHaveBeenCalled();
  });

  it('opens only public drives when signed out', () => {
    api.auth.isAuthenticated.mockReturnValue(false);
    expect(sync(`/${OTHER}/prime`)).not.toHaveBeenCalled();
    sync(`/${OTHER}/${LOG}`);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER);
  });

  it('replaces a legacy timestamp URL with its drive', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatch = sync(LEGACY, { router: { location: { pathname: LEGACY } } });
    await flush();
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`));
  });

  it('keeps a legacy URL when the user has moved on', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatch = sync(LEGACY);
    await flush();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: CALL_HISTORY_METHOD }));
  });

  it.each([
    ['an empty', () => api.routes.getRoutesSegments.mockResolvedValue([])],
    ['a failed', () => {
      api.routes.getRoutesSegments.mockRejectedValue(new Error('lookup failed'));
      vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    }],
  ])('keeps a legacy URL after %s lookup', async (_name, setup) => {
    setup();
    const dispatch = sync(LEGACY, { router: { location: { pathname: LEGACY } } });
    await flush();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: CALL_HISTORY_METHOD }));
  });
});

describe('navigate', () => {
  it('pushes the URL for a location on the selected device', () => {
    const { dispatch, getState } = create();
    navigate({ page: 'drive', logId: LOG })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith(push(`/${DONGLE}/${LOG}`));
  });

  it('does not push the current URL again', () => {
    const { dispatch, getState } = create();
    navigate({ page: 'dashboard' })(dispatch, getState);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('history middleware', () => {
  it('syncs state after every location change', () => {
    const { dispatch, getState } = create();
    const next = vi.fn();
    const action = { type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname: `/${DONGLE}/stream` } } };
    onHistoryMiddleware({ dispatch, getState })(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectDrive', args: [null, null] });
  });

  it('passes other actions through', () => {
    const { dispatch, getState } = create();
    const next = vi.fn();
    onHistoryMiddleware({ dispatch, getState })(next)({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
