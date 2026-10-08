/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware } from './history';
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
  selectDevice: vi.fn(), pushTimelineRange: vi.fn(),
  popTimelineRange: vi.fn(),
  checkRoutesData: vi.fn(), checkLastRoutesData: vi.fn(), primeNav: vi.fn(), streamNav: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
};

function create(state = baseState) {
  let currentState = state;
  const store = { getState: vi.fn(() => currentState), dispatch: vi.fn() };
  const next = vi.fn((action) => {
    if (action.type === LOCATION_CHANGE) {
      currentState = { ...currentState, router: { ...currentState.router, location: action.payload.location } };
    }
    return action;
  });
  const middleware = onHistoryMiddleware(store)(next);
  const invoke = (action) => middleware(action);
  return { store, next, invoke };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'pushTimelineRange', 'popTimelineRange', 'checkRoutesData', 'checkLastRoutesData', 'primeNav', 'streamNav']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['PUSH', undefined])('passes through a non-history %s action', (historyAction) => {
    const { next, invoke } = create();
    const action = historyAction ? location(`/${DONGLE}`, historyAction) : { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it('reconciles arbitrary PUSH navigation through the route parser', () => {
    const { store, invoke } = create(baseState);
    invoke(location(`/${OTHER}/${LOG}/10/20?modal=upload-queue`, 'PUSH'));
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalled();
  });

  it('applies modal query changes without resetting the current route', () => {
    const state = {
      ...baseState,
      router: { location: { pathname: `/${DONGLE}`, search: '' } },
      routeModal: null,
      routeModalDeviceId: null,
    };
    const { store, invoke } = create(state);
    invoke(location(`/${DONGLE}?modal=date-filter`, 'PUSH'));
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'ACTION_ROUTE_MODAL', modal: 'date-filter', deviceId: DONGLE, clip: null,
    });
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it('updates only route clip modal state when the clip query changes', () => {
    const state = {
      ...baseState,
      router: { location: { pathname: `/${DONGLE}/${LOG}`, search: '?modal=clips' } },
      routeModal: 'clips',
      routeModalDeviceId: DONGLE,
      routeModalClip: null,
    };
    const { store, invoke } = create(state);
    invoke({
      type: LOCATION_CHANGE,
      payload: { action: 'PUSH', location: { pathname: `/${DONGLE}/${LOG}`, search: '?modal=clip-viewer&clip=drive.mp4' } },
    });
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'ACTION_ROUTE_MODAL', modal: 'clip-viewer', deviceId: DONGLE, clip: 'drive.mp4',
    });
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, false, false] });
  });

  it('does nothing when the pathname already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('reconciles the first cold location but ignores identical later notifications', () => {
    const state = {
      ...baseState,
      router: { location: { pathname: `/${DONGLE}/${LOG}`, search: '' } },
    };
    const { invoke } = create(state);
    const action = location(`/${DONGLE}/${LOG}`, 'PUSH');
    invoke(action);
    invoke(action);
    expect(actions.pushTimelineRange).toHaveBeenCalledOnce();
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('enters a log range', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
  });

  it('leaves a log range', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  });

  it('pops the zoom stack when history returns to its previous range', () => {
    const state = {
      ...baseState,
      selectedRouteId: LOG,
      routes: [{ log_id: LOG, duration: 60000 }],
      zoom: { start: 10000, end: 20000, previous: { start: 0, end: 60000 } },
    };
    const { invoke } = create(state);
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(actions.popTimelineRange).toHaveBeenCalledWith(LOG, false);
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke, store } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(actions.pushTimelineRange).not.toHaveBeenCalledWith(LOG, null, null, true);
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('keeps legacy conversion active when only the query changes', async () => {
    let resolveLookup;
    const lookup = new Promise((resolve) => { resolveLookup = resolve; });
    Drives.getRoutesSegments.mockReturnValue(lookup);
    const { invoke, store } = create();
    const pathname = `/${DONGLE}/1000/2000`;
    invoke(location(pathname, 'PUSH'));
    invoke({
      type: LOCATION_CHANGE,
      payload: { action: 'PUSH', location: { pathname, search: '?modal=date-filter', hash: '#recent' } },
    });
    resolveLookup([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}?modal=date-filter#recent`)));
    expect(actions.pushTimelineRange).not.toHaveBeenCalledWith(LOG, null, null, true);
    expect(Drives.getRoutesSegments).toHaveBeenCalledOnce();
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['Prime', 'prime', 'primeNav'],
    ['stream', 'stream', 'streamNav'],
  ])('activates and deactivates %s through history', (_name, suffix, actionName) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });
});
