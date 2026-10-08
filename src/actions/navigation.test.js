import { vi } from 'vitest';
import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import * as Types from './types';
import { checkLastRoutesData, selectDevice } from './index';
import { applyLocation, navigate, onHistoryMiddleware } from './navigation';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({
  selectDevice: vi.fn((dongleId) => ({ type: 'selectDevice', dongleId })),
  checkLastRoutesData: vi.fn(() => ({ type: 'checkLastRoutesData' })),
}));
vi.mock('../timeline/playback', () => ({
  resetPlayback: vi.fn(() => ({ type: 'resetPlayback' })),
  selectLoop: vi.fn((start, end) => ({ type: 'selectLoop', start, end })),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// Runs thunks and records the plain actions they dispatch, in order.
function createStore(state) {
  const actions = [];
  const getState = () => state;
  const dispatch = (action) => {
    if (typeof action === 'function') {
      return action(dispatch, getState);
    }
    actions.push(action);
    return action;
  };
  return { actions, dispatch, getState };
}

const types = (actions) => actions.map((a) => a.type);

const baseState = {
  dongleId: DONGLE,
  zoom: null,
  loop: null,
  router: { location: { pathname: `/${DONGLE}` } },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('navigate', () => {
  it.each([
    [{ page: 'prime' }, `/${DONGLE}/prime`],
    [{ page: 'settings', dongleId: OTHER }, `/${OTHER}/settings`],
    [{ page: 'drive', logId: LOG }, `/${DONGLE}/${LOG}`],
    [{ page: 'drive', logId: LOG, zoom: { start: 10000, end: 20000 } }, `/${DONGLE}/${LOG}/10/20`],
    [{ page: 'referrals' }, '/referrals'],
  ])('pushes the URL for %j', (to, expected) => {
    const store = createStore(baseState);
    store.dispatch(navigate(to));
    expect(store.actions).toEqual([push(expected)]);
  });

  it('does nothing when already there', () => {
    const store = createStore(baseState);
    store.dispatch(navigate({ page: 'dashboard' }));
    expect(store.actions).toEqual([]);
  });
});

describe('applyLocation', () => {
  it('selects a new device, navigates, then fetches its routes', () => {
    const store = createStore(baseState);
    const location = { page: 'drive', dongleId: OTHER, logId: LOG, zoom: null };
    store.dispatch(applyLocation(location));
    expect(selectDevice).toHaveBeenCalledWith(OTHER);
    expect(types(store.actions)).toEqual(['selectDevice', Types.ACTION_NAVIGATE, 'checkLastRoutesData']);
    expect(store.actions[1].location).toBe(location);
  });

  it.each([
    ['the same device', DONGLE],
    ['no device in the URL', null],
  ])('keeps the device for %s', (_name, dongleId) => {
    const store = createStore(baseState);
    store.dispatch(applyLocation({ page: 'referrals', dongleId, logId: null, zoom: null }));
    expect(selectDevice).not.toHaveBeenCalled();
    expect(checkLastRoutesData).not.toHaveBeenCalled();
    expect(types(store.actions)).toEqual([Types.ACTION_NAVIGATE]);
  });

  it('restarts playback when the range changes', () => {
    const store = createStore({ ...baseState, zoom: { start: 10000, end: 20000 }, loop: { startTime: 0, duration: 60000 } });
    store.dispatch(applyLocation({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }));
    expect(resetPlayback).toHaveBeenCalledOnce();
    expect(selectLoop).toHaveBeenCalledWith(10000, 20000);
  });

  it('keeps playback when the range is unchanged', () => {
    const store = createStore({ ...baseState, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } });
    store.dispatch(applyLocation({ page: 'drive', dongleId: DONGLE, logId: LOG, zoom: { start: 10000, end: 20000 } }));
    expect(resetPlayback).not.toHaveBeenCalled();
  });

  it('replaces a legacy timestamp range with its drive', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const store = createStore(baseState);
    await store.dispatch(applyLocation({ page: 'legacyRange', dongleId: DONGLE, logId: null, zoom: { start: 1000, end: 2000 } }));
    expect(store.actions).toContainEqual(replace(`/${DONGLE}/${LOG}`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([[null], [[]]])('keeps a legacy range when no drive is found (%j)', async (routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const store = createStore(baseState);
    await store.dispatch(applyLocation({ page: 'legacyRange', dongleId: DONGLE, logId: null, zoom: { start: 1000, end: 2000 } }));
    expect(types(store.actions)).not.toContain(replace('/').type);
  });

  it('keeps a legacy range when the lookup fails', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createStore(baseState);
    await store.dispatch(applyLocation({ page: 'legacyRange', dongleId: DONGLE, logId: null, zoom: { start: 1000, end: 2000 } }));
    expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error);
    expect(types(store.actions)).not.toContain(replace('/').type);
    consoleError.mockRestore();
  });
});

describe('history middleware', () => {
  function run(action) {
    const store = createStore(baseState);
    const next = vi.fn(() => 'next result');
    const result = onHistoryMiddleware(store)(next)(action);
    return { store, next, result };
  }

  it.each(['PUSH', 'POP', 'REPLACE'])('applies the URL after a %s', (historyAction) => {
    const action = { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname: `/${DONGLE}/prime` } } };
    const { store, next, result } = run(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(result).toBe('next result');
    expect(store.actions).toContainEqual({
      type: Types.ACTION_NAVIGATE,
      location: { page: 'prime', dongleId: DONGLE, logId: null, zoom: null },
    });
  });

  it('passes other actions through untouched', () => {
    const { store, next } = run({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(store.actions).toEqual([]);
  });
});
