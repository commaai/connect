/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { applyLocation, onHistoryMiddleware } from './history';
import * as actions from './index';
import * as Types from './types';

vi.mock('../api/backend', () => ({
  api: {
    routes: { getRoutesSegments: vi.fn() },
  },
}));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(),
  checkRoutesData: vi.fn(), primeNav: vi.fn(), streamNav: vi.fn(),
}));
vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    replace: vi.fn((url) => ({ action: 'replace', url })),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE,
  zoom: null,
  selectedRouteId: null,
  primeNav: false,
  streamNav: false,
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function create(initialState = baseState) {
  let state = initialState;
  const store = {
    getState: vi.fn(() => state),
    setState: (nextState) => { state = nextState; },
    dispatch: vi.fn((action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : action)),
  };
  return store;
}

function location(pathname, action = 'POP', search = '') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkRoutesData', 'primeNav', 'streamNav']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const store = create();
    const next = vi.fn();
    onHistoryMiddleware(store)(next)();
    expect(next).not.toHaveBeenCalled();
  });

  it('runs URL application after every location change, including PUSH', () => {
    const store = create();
    const next = vi.fn();
    const action = location(`/${DONGLE}`, 'PUSH');
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('passes through non-location actions', () => {
    const store = create();
    const next = vi.fn();
    const action = { type: 'TEST' };
    onHistoryMiddleware(store)(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE', 'PUSH'])('selects a changed device for %s and refreshes routes', async (historyAction) => {
    const store = create(baseState);
    await applyLocation({ pathname: `/${OTHER}`, search: '' })(store.dispatch, store.getState);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('does nothing when the pathname already matches state', async () => {
    const store = create();
    await applyLocation({ pathname: `/${DONGLE}`, search: '' })(store.dispatch, store.getState);
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('enters a log range', async () => {
    const store = create();
    await applyLocation({ pathname: `/${DONGLE}/${LOG}/10/20`, search: '' })(store.dispatch, store.getState);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
  });

  it('leaves a log range', async () => {
    const store = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    await applyLocation({ pathname: `/${DONGLE}`, search: '' })(store.dispatch, store.getState);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  });

  it('converts a legacy timestamp range to a canonical route URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = create();
    await applyLocation({ pathname: `/${DONGLE}/1000/2000`, search: '' })(store.dispatch, store.getState);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'replace', url: `/${DONGLE}/${LOG}` });
  });

  it('marks failed legacy lookups as not found', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([]);
    const store = create();
    await applyLocation({ pathname: `/${DONGLE}/1000/2000`, search: '' })(store.dispatch, store.getState);
    expect(store.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_URL_NOT_FOUND });
  });

  it('does not let a stale legacy lookup replace the current path', async () => {
    const slow = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(slow.promise);
    const store = create();
    const first = applyLocation({ pathname: `/${DONGLE}/1000/2000`, search: '' })(store.dispatch, store.getState);
    await applyLocation({ pathname: `/${DONGLE}`, search: '?dialog=settings' })(store.dispatch, store.getState);
    slow.resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await first;
    expect(store.dispatch).not.toHaveBeenCalledWith({ action: 'replace', url: `/${DONGLE}/${LOG}` });
  });

  it('keeps useful legacy lookups alive across modal-only query changes', async () => {
    const slow = deferred();
    api.routes.getRoutesSegments.mockReturnValueOnce(slow.promise);
    const store = create();
    const first = applyLocation({ pathname: `/${DONGLE}/1000/2000`, search: '' })(store.dispatch, store.getState);
    await applyLocation({ pathname: `/${DONGLE}/1000/2000`, search: '?dialog=filter' })(store.dispatch, store.getState);
    slow.resolve([{ fullname: `${DONGLE}|${LOG}` }]);
    await first;
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'replace', url: `/${DONGLE}/${LOG}` });
  });

  it.each([
    ['Prime', 'prime', 'primeNav'],
    ['stream', 'stream', 'streamNav'],
  ])('activates and deactivates %s through history', async (_name, suffix, actionName) => {
    const entering = create();
    await applyLocation({ pathname: `/${DONGLE}/${suffix}`, search: '' })(entering.dispatch, entering.getState);
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    await applyLocation({ pathname: `/${DONGLE}`, search: '' })(leaving.dispatch, leaving.getState);
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });
});
