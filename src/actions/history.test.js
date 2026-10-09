import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import * as Types from './types';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('./index', () => ({
  selectDeviceState: vi.fn(),
  pushTimelineRangeState: vi.fn(),
  checkRoutesData: vi.fn(),
  resolveLegacyZoom: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE,
  zoom: null,
  currentRoute: null,
  selectedRouteId: null,
  primeNav: false,
  streamNav: false,
};

function create(state = baseState) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

function location(pathname, action = 'POP', search = '') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, search } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDeviceState', 'pushTimelineRangeState', 'checkRoutesData', 'resolveLegacyZoom']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through a non-history action', () => {
    const { next, invoke } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(actions.selectDeviceState).not.toHaveBeenCalled();
  });

  it('ignores unknown pages', () => {
    const { store, next, invoke } = create();
    invoke(location('/auth/code/provider'));
    expect(next).toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['POP', 'REPLACE', 'PUSH'])('selects a changed device for %s and refreshes routes', (historyAction) => {
    const { store, next, invoke } = create(baseState);
    invoke(location(`/${OTHER}`, historyAction));
    expect(next).toHaveBeenCalled();
    expect(actions.selectDeviceState).toHaveBeenCalledWith(OTHER, false);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({ action: 'selectDeviceState', args: [OTHER, false] });
  });

  it('does nothing when the URL already matches state', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing for a PUSH the app itself just made', () => {
    // precise in-app zoom vs whole-second URL: canonical comparison no-ops
    const { store, invoke } = create({
      ...baseState,
      selectedRouteId: LOG,
      zoom: { start: 12345, end: 67890 },
      currentRoute: { log_id: LOG, duration: 120000 },
    });
    invoke(location(`/${DONGLE}/${LOG}/12/67`, 'PUSH'));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('treats a whole-drive zoom as matching a rangeless URL', () => {
    const { store, invoke } = create({
      ...baseState,
      selectedRouteId: LOG,
      zoom: { start: 0, end: 60000 },
      currentRoute: { log_id: LOG, duration: 60000 },
    });
    invoke(location(`/${DONGLE}/${LOG}`, 'PUSH'));
    expect(actions.pushTimelineRangeState).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('enters a log range', () => {
    const { invoke } = create();
    invoke(location(`/${DONGLE}/${LOG}/10/20`));
    expect(actions.pushTimelineRangeState).toHaveBeenCalledWith(LOG, 10000, 20000);
  });

  it('leaves a log range', () => {
    const { invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 10000, end: 20000 } });
    invoke(location(`/${DONGLE}`));
    expect(actions.pushTimelineRangeState).toHaveBeenCalledWith(null, null, null);
  });

  it('keeps the device when visiting referrals but clears the route', () => {
    const { store, invoke } = create({ ...baseState, selectedRouteId: LOG, zoom: { start: 0, end: 60000 } });
    invoke(location('/referrals'));
    expect(actions.selectDeviceState).not.toHaveBeenCalled();
    expect(actions.pushTimelineRangeState).toHaveBeenCalledWith(null, null, null);
    expect(store.getState().dongleId).toBe(DONGLE);
  });

  it('delegates legacy timestamp ranges to the conversion thunk', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}/1000/2000`));
    expect(actions.resolveLegacyZoom).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(actions.pushTimelineRangeState).not.toHaveBeenCalled();
    expect(actions.selectDeviceState).not.toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['prime', 'prime', Types.ACTION_PRIME_NAV, 'primeNav'],
    ['stream', 'stream', Types.ACTION_STREAM_NAV, 'streamNav'],
  ])('activates and deactivates %s through history', (_name, suffix, type, key) => {
    const entering = create();
    entering.invoke(location(`/${DONGLE}/${suffix}`, 'REPLACE'));
    expect(entering.store.dispatch).toHaveBeenCalledWith({ type, [key]: true });

    vi.clearAllMocks();
    const leaving = create({ ...baseState, [key]: true });
    leaving.invoke(location(`/${DONGLE}`, 'POP'));
    expect(leaving.store.dispatch).toHaveBeenCalledWith({ type, [key]: false });
  });

  it('preserves the settings overlay across a POP (no state churn)', () => {
    const { store, invoke } = create();
    invoke(location(`/${DONGLE}`, 'POP', `?settings=${DONGLE}`));
    // pathname nav matches: overlays are render-derived, middleware stays out
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
