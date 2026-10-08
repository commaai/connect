/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { applyPath, onHistoryMiddleware } from './history';
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
  selectDevice: vi.fn(),
  pushTimelineRange: vi.fn(),
  checkRoutesData: vi.fn(),
  primeNav: vi.fn(),
  streamNav: vi.fn(),
}));
vi.mock('connected-react-router', async () => {
  const originalModule = await vi.importActual('connected-react-router');
  return {
    __esModule: true,
    ...originalModule,
    replace: vi.fn(),
  };
});

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false,
};

function create(state = baseState) {
  const store = {
    getState: vi.fn(() => state),
    dispatch: vi.fn((action) => {
      if (typeof action === 'function') {
        action(store.dispatch, store.getState);
      }
    }),
  };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, historyAction = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname } } };
}

function apply(pathname, state = baseState) {
  const getState = vi.fn(() => state);
  const dispatch = vi.fn((action) => {
    if (typeof action === 'function') {
      action(dispatch, getState);
    }
  });
  applyPath(pathname)(dispatch, getState);
  return dispatch;
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

  it('passes through actions that are not location changes', () => {
    const { next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE', 'PUSH'])('applies the path for a %s location change', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, false, false] });
  });
});

describe('applyPath', () => {
  it('does nothing when the path already matches state', () => {
    const dispatch = apply(`/${DONGLE}`);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('enters a drive range', () => {
    apply(`/${DONGLE}/${LOG}/10/20`);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, false);
  });

  it('reuses an applied drive range', () => {
    const state = { ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 }, loop: { startTime: 10000, duration: 10000 } };
    const dispatch = apply(`/${DONGLE}/${LOG}/10/20`, state);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reuses a whole drive while its metadata is still loading', () => {
    const state = { ...baseState, selectedRouteId: LOG, zoom: null, loop: null, currentRoute: null };
    const dispatch = apply(`/${DONGLE}/${LOG}`, state);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves a drive for any other page', () => {
    const state = { ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } };
    apply(`/${DONGLE}`, state);
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  });

  it('converts a legacy timestamp range to the canonical route URL', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/${DONGLE}/${LOG}`));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(replace).not.toHaveBeenCalled();
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['Prime', 'prime', 'primeNav'],
    ['stream', 'stream', 'streamNav'],
  ])('activates and deactivates %s through the path', (_name, suffix, actionName) => {
    apply(`/${DONGLE}/${suffix}`);
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    apply(`/${DONGLE}`, { ...baseState, [`${suffix}Nav`]: true });
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });
});
