import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { onHistoryMiddleware } from './history';
import { ACTION_NAVIGATION } from './types';
import { parseLocation } from '../url';
import { api } from '../api/backend';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({ selectDevice: vi.fn(), pushTimelineRange: vi.fn(), checkRoutesData: vi.fn() }));
vi.mock('connected-react-router', async () => ({ ...(await vi.importActual('connected-react-router')), replace: vi.fn((url) => ({ type: 'REPLACE', url })) }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = { dongleId: DONGLE, zoom: null, selectedRouteId: null, routes: [{ log_id: LOG }], navigation: parseLocation(`/${DONGLE}`) };

function create(initial = baseState) {
  let state = initial;
  const next = vi.fn((action) => {
    if (action.type === LOCATION_CHANGE) state = { ...state, router: { location: action.payload.location } };
    return action;
  });
  const store = { getState: vi.fn(() => state), dispatch: vi.fn((action) => {
    if (action.type === ACTION_NAVIGATION) state = { ...state, navigation: action.navigation };
    if (action.action === 'selectDevice') state = { ...state, dongleId: action.args[0], selectedRouteId: null };
    if (action.action === 'pushTimelineRange') state = { ...state, selectedRouteId: action.args[0] };
  }) };
  const invoke = onHistoryMiddleware(store)(next);
  return { store, next, invoke };
}

function location(pathname, action = 'POP', search = '') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('central URL application', () => {
  it('passes through ordinary actions and ignores an absent one', () => {
    const { next, invoke, store } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
    const action = { type: 'TEST' };
    expect(invoke(action)).toBe(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('selects the device and view for %s after updating the router', (kind) => {
    const { invoke, next, store } = create();
    const action = location(`/${OTHER}/prime`, kind);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(next.mock.invocationCallOrder[0]).toBeLessThan(store.dispatch.mock.invocationCallOrder[0]);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(store.getState().navigation).toMatchObject({ view: 'prime', dongleId: OTHER });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('selects a drive range and clears it on leaving', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/0/20`, 'PUSH'));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 0, 20000, false);
    invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions.pushTimelineRange).toHaveBeenLastCalledWith(null, null, null, false);
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('preserves loaded drive state for an overlay-only %s transition', (kind) => {
    const route = { log_id: LOG, fullname: `${DONGLE}|${LOG}`, duration: 60000 };
    const initial = { ...baseState, routes: [route], currentRoute: route, selectedRouteId: LOG,
      zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 }, offset: 42000,
      navigation: parseLocation(`/${DONGLE}/${LOG}`) };
    const { invoke, store } = create(initial);
    invoke(location(`/${DONGLE}/${LOG}`, kind, '?modal=settings'));
    expect(store.getState()).toMatchObject({ currentRoute: route, zoom: initial.zoom, loop: initial.loop, offset: 42000 });
    expect(store.getState().routes).toBe(initial.routes);
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
    expect(store.getState().navigation.modal).toBe('settings');
  });

  it('replaces a legacy timestamp URL while preserving demo, query and hash', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke } = create();
    const action = location(`/demo/${DONGLE}/1000/2000`, 'PUSH', '?utm_source=test');
    action.payload.location.hash = '#keep';
    invoke(action);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/demo/${DONGLE}/${LOG}?utm_source=test#keep`));
  });

  it('ignores a legacy conversion that resolves after a newer navigation', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    invoke(location(`/${DONGLE}/stream`, 'PUSH'));
    resolve([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([null, []])('does not convert an empty legacy result (%j)', async (routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
  });

  it('rejects invalid ranges before requesting conversion', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/Infinity/2000`));
    expect(api.routes.getRoutesSegments).not.toHaveBeenCalled();
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });
});
