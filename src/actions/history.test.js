/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

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
  settingsNav: vi.fn(), referralsNav: vi.fn(),
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
  for (const name of ['selectDevice', 'pushTimelineRange', 'checkRoutesData', 'primeNav', 'streamNav', 'settingsNav', 'referralsNav']) {
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

  it('selects a device for a plain PUSH, not just pop/replace', () => {
    const { store, invoke } = create(baseState);
    invoke(location(`/${OTHER}`, 'PUSH'));
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER, false, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDevice', args: [OTHER, false, false] });
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

  it('reuses a matching selection, down to the millisecond', () => {
    const { invoke } = create({
      ...baseState,
      selectedRouteId: LOG,
      zoom: { start: 10432, end: 20999 }, // finer precision than the URL stores
    });
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('reuses a whole-route selection for a drive URL without a range', () => {
    const { invoke } = create({
      ...baseState,
      selectedRouteId: LOG,
      currentRoute: { log_id: LOG, duration: 60000 },
      zoom: { start: 0, end: 60000 },
    });
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('widens a partial selection when the URL drops the range', () => {
    const { invoke } = create({
      ...baseState,
      selectedRouteId: LOG,
      currentRoute: { log_id: LOG, duration: 60000 },
      zoom: { start: 0, end: 5000 },
    });
    invoke(location(`/${DONGLE}/${LOG}`));
    expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, null, null, false);
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000 }]);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, null, null, true));
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
    ['settings', 'settings', 'settingsNav'],
  ])('activates and deactivates %s through history', (_name, suffix, actionName) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(actions[actionName]).toHaveBeenCalledWith(true, false);

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [`${suffix}Nav`]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions[actionName]).toHaveBeenCalledWith(false, false);
  });

  it('activates and deactivates referrals through history', () => {
    const entering = create();
    entering.invoke(location('/referrals', 'REPLACE'));
    expect(actions.referralsNav).toHaveBeenCalledWith(true, false);
    expect(actions.selectDevice).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const leaving = create({ ...baseState, referralsNav: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(actions.referralsNav).toHaveBeenCalledWith(false, false);
  });
});
