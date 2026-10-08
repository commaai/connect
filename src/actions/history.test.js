/* eslint-disable no-import-assign */
import { expect, it, vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { onHistoryMiddleware, syncStateFromUrl } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(),
  checkRoutesData: vi.fn(), primeNav: vi.fn(), streamNav: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
};

function create(state = baseState) {
  const dispatched = [];
  const store = {
    getState: vi.fn(() => state),
    dispatch: vi.fn((action) => {
      dispatched.push(action);
      return typeof action === 'function' ? action(store.dispatch, store.getState) : action;
    }),
  };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { dispatched, store, next, invoke };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkRoutesData', 'primeNav', 'streamNav']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through non-history actions unchanged', () => {
    const { next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.primeNav).not.toHaveBeenCalled();
  });

  it('passes through PUSH and synchronizes URL state', async () => {
    const { next, invoke } = create();
    const action = location(`/${DONGLE}`, 'PUSH');
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    await vi.waitFor(() => expect(actions.primeNav).toHaveBeenCalledWith(false, false));
  });

  it.each(['POP', 'REPLACE'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, false, false] });
  });

  it('enters a log range', async () => {
    const { store } = create();
    await store.dispatch(syncStateFromUrl(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
  });

  it('leaves a log range', async () => {
    const { store } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    await store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  });

  it('converts a legacy timestamp range to a route', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store } = create();
    await store.dispatch(syncStateFromUrl(`/${DONGLE}/1000/2000`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000000, 2000000);
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const { store } = create();
    await store.dispatch(syncStateFromUrl(`/${DONGLE}/1000/2000`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalled();
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = create();
    await store.dispatch(syncStateFromUrl(`/${DONGLE}/1000/2000`));
    expect(consoleError).toHaveBeenCalledWith('Unable to resolve legacy route URL', error);
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['Prime', 'prime', 'primeNav'],
    ['stream', 'stream', 'streamNav'],
  ])('activates and deactivates %s through history', async (_name, suffix, actionName) => {
    const entering = create();
    await entering.store.dispatch(syncStateFromUrl(`/${DONGLE}/${suffix}`));
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    await leaving.store.dispatch(syncStateFromUrl(`/${DONGLE}`));
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });
});
