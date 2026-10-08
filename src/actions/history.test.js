import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { drives as Drives } from '../api';
import { LEGACY_LOOKUP_ERROR, onHistoryMiddleware } from './history';
import * as actions from './index';
import * as Types from './types';

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
  loadDevice: vi.fn(),
  commitTimeline: vi.fn(),
  checkRoutesData: vi.fn(),
  checkLastRoutesData: vi.fn(),
  pushTimelineRange: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE, zoom: null, selectedRouteId: null, primeNav: false, streamNav: false, settingsNav: false,
};

function create(state = baseState) {
  const store = {
    getState: vi.fn(() => state),
    dispatch: vi.fn((action) => {
      if (typeof action === 'function') return action(store.dispatch, store.getState);
    }),
  };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['loadDevice', 'commitTimeline', 'checkRoutesData', 'checkLastRoutesData', 'pushTimelineRange']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('passes a non-navigation action through', () => {
    const { next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.loadDevice).not.toHaveBeenCalled();
  });

  it('does not reload a device the path already shows', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(actions.loadDevice).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it.each(['POP', 'PUSH'])('loads a changed device and its routes on %s', (historyAction) => {
    const { invoke } = create();
    invoke(location(`/${OTHER}`, historyAction));
    expect(actions.loadDevice).toHaveBeenCalledWith(OTHER);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('keeps a sub-second range when the path names that second', () => {
    const zoom = { start: 110200, end: 110800 };
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom });
    invoke(location(`/${DONGLE}/${LOG}/110/110`));
    expect(actions.commitTimeline).toHaveBeenCalledWith(LOG, 110200, 110800);
  });

  it('does not apply an equal-second path as a zero-length range', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/110/110`));
    expect(actions.commitTimeline).toHaveBeenCalledWith(LOG, null, null);
  });

  it('opens a drive range without reloading the device', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.loadDevice).not.toHaveBeenCalled();
    expect(actions.commitTimeline).toHaveBeenCalledWith(LOG, 10000, 20000);
  });

  it('rewrites a legacy timestamp range to its route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{
      fullname: `${DONGLE}|${LOG}`, start_time_utc_millis: 1000, end_time_utc_millis: 61000,
    }]);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(actions.pushTimelineRange).toHaveBeenCalledWith(LOG, null, null, { replace: true }));
  });

  it('ignores a legacy lookup that resolves after leaving', async () => {
    let resolveLookup;
    Drives.getRoutesSegments.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const { invoke, store } = create({
      ...baseState,
      router: { location: { pathname: `/${DONGLE}/1000/2000` } },
    });
    invoke(location(`/${DONGLE}/1000/2000`));
    store.getState.mockReturnValue({ ...baseState, router: { location: { pathname: `/${OTHER}` } } });
    resolveLookup([{ fullname: `${DONGLE}|${LOG}` }]);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('does not rewrite a legacy range when the lookup is empty', async () => {
    Drives.getRoutesSegments.mockResolvedValue([]);
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(Drives.getRoutesSegments).toHaveBeenCalled());
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
  });

  it('leaves a legacy range unchanged when lookup fails', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(LEGACY_LOOKUP_ERROR, error));
    expect(actions.pushTimelineRange).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['prime', 'prime', Types.ACTION_PRIME_NAV, 'primeNav'],
    ['stream', 'stream', Types.ACTION_STREAM_NAV, 'streamNav'],
    ['settings', 'settings', Types.ACTION_SETTINGS_NAV, 'settingsNav'],
  ])('opens and closes %s from the path', (_name, suffix, type, key) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`));
    expect(entering.store.dispatch).toHaveBeenCalledWith({ type, [key]: true });

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [key]: true });
    leaving.invoke(location(`/${DONGLE}`));
    expect(leaving.store.dispatch).toHaveBeenCalledWith({ type, [key]: false });
  });
});
