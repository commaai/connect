import { LOCATION_CHANGE } from 'connected-react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api, selectBackendType } from '../api/backend';
import {
  applyLocation, closeDialog, navigateBackFromDriveRange, navigateTo, navigateToDrive,
  onHistoryMiddleware, openDialog,
} from './history';
import { hardNavigate } from '../utils/navigation';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  api: { routes: { getRoutesSegments: vi.fn() } },
  selectBackendType: vi.fn(() => 'real'),
}));
vi.mock('../utils/navigation', () => ({ hardNavigate: vi.fn() }));
vi.mock('./index', () => ({
  checkLastRoutesData: vi.fn(),
  checkRoutesData: vi.fn(),
  selectDeviceState: vi.fn(),
  selectTimelineRange: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const baseState = {
  dongleId: DONGLE,
  router: { location: { pathname: `/${DONGLE}`, search: '', hash: '' } },
  routes: [{ log_id: LOG, duration: 60000 }],
};

function execute(state = baseState) {
  const getState = vi.fn(() => state);
  const dispatch = vi.fn((action) => (
    typeof action === 'function' ? action(dispatch, getState) : action
  ));
  return { dispatch, getState };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectBackendType.mockImplementation((pathname) => (
    pathname === '/demo' ? 'demo' : 'real'
  ));
  for (const name of ['checkLastRoutesData', 'checkRoutesData', 'selectDeviceState', 'selectTimelineRange']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('URL navigation', () => {
  it('only pushes when the requested page differs', () => {
    const same = execute();
    navigateTo({ page: 'dashboard' })(same.dispatch, same.getState);
    expect(same.dispatch).not.toHaveBeenCalled();

    const changed = execute();
    navigateTo({ page: 'prime' })(changed.dispatch, changed.getState);
    expect(changed.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'push', args: [`/${DONGLE}/prime`] },
    }));
  });

  it('can replace an automatic navigation without adding a history entry', () => {
    const { dispatch, getState } = execute({
      ...baseState,
      router: { location: { pathname: '/', search: '?keep=yes', hash: '#position' } },
    });
    navigateTo(
      { page: 'dashboard' },
      { preserveUrlSuffix: true, replace: true },
    )(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}?keep=yes#position`] },
    }));
  });

  it('opens a dialog over the current page and browser history closes it', () => {
    const opened = execute();
    openDialog('settings', { device: OTHER })(opened.dispatch, opened.getState);
    expect(opened.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        method: 'push',
        args: [`/${DONGLE}?dialog=settings&device=${OTHER}`, { returnTo: `/${DONGLE}` }],
      },
    }));

    const state = {
      ...baseState,
      router: { location: {
        pathname: `/${DONGLE}`,
        search: `?dialog=settings&device=${OTHER}`,
        hash: '',
        state: { returnTo: `/${DONGLE}` },
      } },
    };
    const closed = execute(state);
    closeDialog()(closed.dispatch, closed.getState);
    expect(closed.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'goBack', args: [] },
    }));
  });

  it('replaces a cold dialog URL and preserves unrelated parameters', () => {
    const state = {
      ...baseState,
      router: { location: {
        pathname: `/${DONGLE}`,
        search: `?keep=yes&dialog=settings&device=${OTHER}`,
        hash: '#position',
      } },
    };
    const closed = execute(state);
    closeDialog()(closed.dispatch, closed.getState);
    expect(closed.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}?keep=yes#position`] },
    }));
  });

  it('uses the short URL for a whole drive and keeps a zero-start range', () => {
    const whole = execute();
    navigateToDrive(LOG, 0, 60000)(whole.dispatch, whole.getState);
    expect(whole.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'push', args: [`/${DONGLE}/${LOG}`] },
    }));

    const range = execute();
    navigateToDrive(LOG, 0, 20000)(range.dispatch, range.getState);
    expect(range.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'push', args: [`/${DONGLE}/${LOG}/0/20`] },
    }));
  });

  it.each([
    [1000, null],
    [null, 1000],
  ])('rejects a one-sided drive range (%s, %s)', (start, end) => {
    const { dispatch, getState } = execute();
    expect(() => navigateToDrive(LOG, start, end)(dispatch, getState))
      .toThrow('A drive range requires both start and end');
  });

  it('uses browser history for an in-app range and replaces a cold range', () => {
    const state = {
      ...baseState,
      router: { location: { pathname: `/${DONGLE}/${LOG}`, search: '', hash: '' } },
    };
    const opened = execute(state);
    navigateToDrive(LOG, 1000, 10000)(opened.dispatch, opened.getState);
    expect(opened.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        method: 'push',
        args: [
          `/${DONGLE}/${LOG}/1/10`,
          { returnTo: `/${DONGLE}/${LOG}` },
        ],
      },
    }));

    state.router.location = {
      pathname: `/${DONGLE}/${LOG}/1/10`,
      search: '',
      hash: '',
      state: { returnTo: `/${DONGLE}/${LOG}` },
    };
    const back = execute(state);
    navigateBackFromDriveRange()(back.dispatch, back.getState);
    expect(back.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'goBack', args: [] },
    }));

    delete state.router.location.state;
    const cold = execute(state);
    navigateBackFromDriveRange()(cold.dispatch, cold.getState);
    expect(cold.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}/${LOG}`] },
    }));
  });
});

describe('URL to state', () => {
  it('canonicalizes a later root visit to the selected device without growing history', () => {
    const state = {
      ...baseState,
      router: { location: { pathname: '/', search: '?keep=yes', hash: '#position' } },
    };
    const { dispatch, getState } = execute(state);
    applyLocation({ page: 'home' })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}?keep=yes#position`] },
    }));
    expect(actions.selectTimelineRange).not.toHaveBeenCalled();
  });

  it('changes only the device and selection described by a drive URL', () => {
    const { dispatch, getState } = execute();
    applyLocation({ page: 'drive', dongleId: OTHER, logId: LOG, start: 0, end: 20000 })(dispatch, getState);
    expect(actions.selectDeviceState).toHaveBeenCalledWith(OTHER);
    expect(actions.selectTimelineRange).toHaveBeenCalledWith(LOG, 0, 20000);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('returns to the dashboard without reselecting the current device', () => {
    const { dispatch, getState } = execute();
    applyLocation({ page: 'dashboard', dongleId: DONGLE })(dispatch, getState);
    expect(actions.selectDeviceState).not.toHaveBeenCalled();
    expect(actions.selectTimelineRange).toHaveBeenCalledWith(null, null, null);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('reuses a loaded dashboard when returning from a drive', () => {
    const state = {
      ...baseState,
      filter: { start: 1000, end: 2000 },
      routesMeta: { dongleId: DONGLE, start: 1000, end: 2000 },
    };
    const { dispatch, getState } = execute(state);
    applyLocation({ page: 'dashboard', dongleId: DONGLE })(dispatch, getState);
    expect(actions.selectTimelineRange).toHaveBeenCalledWith(null, null, null);
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('clears drive state on pages without a device', () => {
    const { dispatch, getState } = execute();
    applyLocation({ page: 'referrals' })(dispatch, getState);
    expect(actions.selectTimelineRange).toHaveBeenCalledWith(null, null, null);
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('replaces a legacy timestamp URL and ignores a stale lookup', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const state = {
      ...baseState,
      router: { location: { pathname: `/${DONGLE}/1000/2000`, search: '?keep=yes', hash: '#position' } },
    };
    const current = execute(state);
    const conversion = applyLocation(
      { page: 'legacy', dongleId: DONGLE, from: 1000, to: 2000 },
    )(current.dispatch, current.getState);
    expect(actions.selectTimelineRange).toHaveBeenCalledWith(null, null, null);
    await conversion;
    await vi.waitFor(() => expect(current.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}/${LOG}?keep=yes#position`] },
    })));

    let resolveLookup;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const staleState = {
      ...state,
      router: { location: { pathname: `/${DONGLE}/1000/2000`, search: '', hash: '' } },
    };
    const stale = execute(staleState);
    let lookupIsCurrent = true;
    const lookup = applyLocation(
      { page: 'legacy', dongleId: DONGLE, from: 1000, to: 2000 },
      () => lookupIsCurrent,
    )(stale.dispatch, stale.getState);
    staleState.router.location.pathname = `/${DONGLE}`;
    staleState.router.location.pathname = `/${DONGLE}/1000/2000`;
    lookupIsCurrent = false;
    resolveLookup([{ fullname: `${DONGLE}|${LOG}` }]);
    await lookup;
    expect(stale.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ method: 'replace' }),
    }));
  });
});

describe('history middleware', () => {
  it('ignores a legacy result after leaving and returning to the same URL', async () => {
    const pending = [];
    api.routes.getRoutesSegments.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const state = { ...baseState, router: { ...baseState.router } };
    const store = execute(state);
    const middleware = onHistoryMiddleware(store)((action) => {
      state.router.location = action.payload.location;
    });
    const navigate = (pathname, search = '') => middleware({
      type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname, search } },
    });

    const legacy = `/${DONGLE}/1000/2000`;
    navigate(legacy);
    navigate(`/${DONGLE}`);
    navigate(legacy);
    navigate(legacy, '?keep=yes');
    expect(pending).toHaveLength(2);

    pending[0]([{ fullname: `${DONGLE}|${LOG}` }]);
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ method: 'replace' }),
    }));
    pending[1]([{ fullname: `${DONGLE}|${LOG}` }]);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}/${LOG}?keep=yes`] },
    })));
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies every %s location after updating history', (historyAction) => {
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    const next = vi.fn();
    const action = {
      type: LOCATION_CHANGE,
      payload: { action: historyAction, location: { pathname: `/${DONGLE}` } },
    };
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('ignores an absent action', () => {
    const next = vi.fn();
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    expect(onHistoryMiddleware(store)(next)()).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through non-history actions without reconciling URL state', () => {
    const next = vi.fn(() => 'result');
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    const action = { type: 'OTHER_ACTION' };
    expect(onHistoryMiddleware(store)(next)(action)).toBe('result');
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does not reconcile a query-only dialog change', () => {
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    const next = vi.fn();
    const middleware = onHistoryMiddleware(store)(next);
    middleware({
      type: LOCATION_CHANGE,
      payload: { action: 'PUSH', location: { pathname: `/${DONGLE}`, search: '' } },
    });
    store.dispatch.mockClear();
    middleware({
      type: LOCATION_CHANGE,
      payload: { action: 'PUSH', location: { pathname: `/${DONGLE}`, search: '?dialog=settings' } },
    });
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('canonicalizes malformed dialog state before reconciling the path', () => {
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    const next = vi.fn();
    onHistoryMiddleware(store)(next)({
      type: LOCATION_CHANGE,
      payload: {
        action: 'PUSH',
        location: { pathname: `/${DONGLE}`, search: '?keep=yes&dialog=uploads' },
      },
    });
    expect(store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { method: 'replace', args: [`/${DONGLE}?keep=yes`] },
    }));
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.any(Function));
  });

  it('reloads when navigation crosses the demo backend boundary', () => {
    const store = { dispatch: vi.fn(), getState: vi.fn(() => baseState) };
    const next = vi.fn();
    onHistoryMiddleware(store)(next)({
      type: LOCATION_CHANGE,
      payload: { action: 'PUSH', location: { pathname: '/demo', search: '', hash: '' } },
    });
    expect(hardNavigate).toHaveBeenCalledWith('/demo');
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.any(Function));
  });
});
