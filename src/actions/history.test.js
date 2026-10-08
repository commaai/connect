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
  const invoke = onHistoryMiddleware(store)(next);
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

  it.each(['POP', 'REPLACE'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    const action = location(`/${OTHER}`, historyAction);
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, false, false] });
  });

  it('does nothing when the pathname already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
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

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke, store } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(store.dispatch).toHaveBeenCalledWith(replace({ pathname: `/${DONGLE}/${LOG}` })));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
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

describe('URL-owned transitions', () => {
  it.each(['PUSH', 'POP', 'REPLACE'])('applies drive navigation for %s', (action) => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/0/20`, action));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, 0, 20000, false);
  });
  it('does not reset the current drive when only a modal query changes', () => {
    const { store, invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 0, end: 20000 } });
    const action = location(`/${DONGLE}/${LOG}/0/20`, 'PUSH');
    action.payload.location.search = `?settings=${DONGLE}`;
    invoke(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });
  it('does not push another URL while applying browser history to Prime', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/prime`));
    expect(actions.primeNav).toHaveBeenCalledWith(true, false);
  });
  it('ignores a legacy lookup after navigating away', async () => {
    let finish;
    Drives.getRoutesSegments.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    invoke(location(`/${DONGLE}`));
    finish([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    await Promise.resolve();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

it('returns to the dashboard on the home URL without refetching the device', () => {
  const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 0, end: 20000 } });
  invoke(location('/', 'PUSH'));
  expect(actions.pushTimelineRange).toHaveBeenCalledWith(null, null, null, false);
  expect(actions.selectDevice).not.toHaveBeenCalled();
});

it('preserves a loaded whole drive when only the settings URL changes', () => {
  const { store, invoke } = create({ ...baseState, selectedRouteId: LOG,
    zoom: { start: 0, end: 60000 }, currentRoute: { duration: 60000 } });
  const action = location(`/${DONGLE}/${LOG}`, 'PUSH');
  action.payload.location.search = `?settings=${DONGLE}`;
  invoke(action);
  expect(store.dispatch).not.toHaveBeenCalled();
});

it('leaves stream/Prime navigation when entering referrals without dropping cached drive state', () => {
  const { invoke } = create({ ...baseState, streamNav: true, primeNav: true, selectedRouteId: LOG });
  invoke(location('/referrals', 'PUSH'));
  expect(actions.streamNav).toHaveBeenCalledWith(false, false);
  expect(actions.primeNav).toHaveBeenCalledWith(false, false);
  expect(actions.pushTimelineRange).not.toHaveBeenCalled();
});
it('selects the synthetic device when entering the demo URL', () => {
  const { invoke } = create();
  invoke(location('/demo', 'PUSH'));
  expect(actions.selectDevice).toHaveBeenCalledWith('deadbeefdeadbeef', false, false);
});
