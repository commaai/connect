/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

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
vi.mock('../api/backend', () => ({
  api: { routes: { getRoutesSegments: vi.fn() } },
}));
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
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
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

describe('history middleware: URL -> state', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through non-history actions', () => {
    const { next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE', 'PUSH'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, { navigate: false, fetchRoutes: false });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, { navigate: false, fetchRoutes: false }] });
  });

  it('does nothing when the pathname already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('enters a log range (including PUSH)', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`, 'PUSH'));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 10000, 20000, { navigate: false });
  });

  it('keeps zero-start zooms in state', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/0/20`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 0, 20000, { navigate: false });
  });

  it('reuses state when the URL agrees at URL precision', () => {
    const { store, invoke } = create({
      ...baseState, selectedRouteId: LOG, zoom: { start: 10500, end: 20500 },
    });
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('leaves a log range', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, { navigate: false });
  });

  it('converts a legacy timestamp range to a route with replace', async () => {
    const { api } = await import('../api/backend');
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 0, 60000, { navigate: true, replace: true }));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([null, []])('keeps a legacy range unchanged for an empty lookup (%j)', async (routes) => {
    const { api } = await import('../api/backend');
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('keeps a legacy range unchanged when lookup rejects', async () => {
    const { api } = await import('../api/backend');
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['prime', 'primeNav'],
    ['stream', 'streamNav'],
  ])('syncs %s flags from the URL (including PUSH)', (suffix, actionName) => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${suffix}`, 'PUSH'));
    expect(actions[actionName]).toHaveBeenCalledWith(true, { navigate: false });

    vi.clearAllMocks();
    for (const name of ['selectDevice', 'pushTimelineRange', 'checkRoutesData', 'primeNav', 'streamNav']) {
      actions[name].mockImplementation((...args) => ({ action: name, args }));
    }
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions[actionName]).toHaveBeenCalledWith(false, { navigate: false });
  });

  it('settings has a URL and needs no flag', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/settings`, 'PUSH'));
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    // only page-flag syncs may fire; device/drive stay untouched
    expect(store.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'selectDevice' }));
  });
});
