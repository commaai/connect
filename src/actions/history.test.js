import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import * as Types from './types';
import { onHistoryMiddleware } from './history';
import * as actions from './index';
import { createInitialState } from '../initialState';
import { webrtcConnectionManager } from '../utils/webrtc';

vi.mock('connected-react-router', async () => {
  const actual = await vi.importActual('connected-react-router');
  return {
    ...actual,
    replace: vi.fn((url) => ({ type: 'REPLACE', url })),
  };
});
vi.mock('./index', () => ({
  checkLastRoutesData: vi.fn(() => ({ type: 'CHECK_LAST_ROUTES' })),
  checkRoutesData: vi.fn(() => ({ type: 'CHECK_ROUTES' })),
  fetchDeviceOnline: vi.fn((id) => ({ type: 'FETCH_ONLINE', id })),
  fetchSharedDevice: vi.fn((id) => ({ type: 'FETCH_SHARED', id })),
  primeFetchSubscription: vi.fn((id, device) => ({ type: 'FETCH_PRIME', id, device })),
  resolveLegacyRange: vi.fn((...args) => ({ type: 'RESOLVE_LEGACY', args })),
}));
vi.mock('../utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const device = (dongle_id) => ({ dongle_id, is_owner: true, shared: false });

function create({ pathname = `/${DONGLE}`, startupComplete = false, devices = [] } = {}) {
  const initialLocation = { pathname, search: '', hash: '', state: null };
  let state = {
    ...createInitialState(initialLocation),
    startupComplete,
    devices,
    profile: null,
    router: { location: initialLocation },
  };
  const dispatched = [];
  const store = {
    getState: vi.fn(() => state),
    dispatch: vi.fn((action) => {
      dispatched.push(action);
      if (action.type === Types.ACTION_SYNC_URL) {
        const destination = action.destination;
        const dongleId = destination.dongleId
          || (['home', 'referrals'].includes(destination.page) ? state.dongleId : null);
        const deviceChanged = dongleId !== state.dongleId;
        state = {
          ...state,
          navigation: destination,
          dongleId,
          filter: destination.filter || state.filter,
          device: deviceChanged ? state.devices.find((candidate) => candidate.dongle_id === dongleId) || null : state.device,
        };
      }
      return action;
    }),
  };
  const next = vi.fn((action) => {
    if (action?.type === LOCATION_CHANGE) {
      state = { ...state, router: { location: action.payload.location } };
    }
    return action;
  });
  const invoke = (location, action = 'POP') => onHistoryMiddleware(store)(next)({
    type: LOCATION_CHANGE,
    payload: { action, location: { ...location, state: location.state || null } },
  });
  return { dispatched, invoke, next, store, getState: () => state };
}

beforeEach(() => vi.clearAllMocks());

describe('history middleware', () => {
  it('passes through non-location actions and ignores an absent action', () => {
    const { next } = create();
    onHistoryMiddleware({ dispatch: vi.fn(), getState: vi.fn() })(next)();
    const action = { type: 'TEST' };
    onHistoryMiddleware({ dispatch: vi.fn(), getState: vi.fn() })(next)(action);
    expect(next).toHaveBeenCalledWith(action);
  });

  it('syncs every location change from the URL before startup side effects', () => {
    const { dispatched, invoke } = create();
    invoke({ pathname: `/${DONGLE}/${LOG}/0/20`, search: '?dialog=clips' }, 'PUSH');
    expect(dispatched).toContainEqual(expect.objectContaining({
      type: Types.ACTION_SYNC_URL,
      destination: expect.objectContaining({
        page: 'drive', dongleId: DONGLE, logId: LOG,
        range: { start: 0, end: 20_000 }, dialog: 'clips',
      }),
    }));
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
  });

  it('loads a route for a deep-linked drive after startup', () => {
    const { invoke } = create({ startupComplete: true, devices: [device(DONGLE)] });
    invoke({ pathname: `/${DONGLE}`, search: '' });
    actions.checkLastRoutesData.mockClear();
    invoke({ pathname: `/${DONGLE}/${LOG}/0/20`, search: '' }, 'PUSH');
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
    expect(actions.checkLastRoutesData).not.toHaveBeenCalled();
  });

  it('syncs device changes and refreshes device-specific data', () => {
    const { dispatched, invoke } = create({
      startupComplete: true,
      devices: [device(DONGLE), device(OTHER)],
    });
    invoke({ pathname: `/${OTHER}`, search: '' }, 'POP');
    expect(dispatched).toContainEqual({
      type: Types.ACTION_SYNC_URL,
      destination: expect.objectContaining({ page: 'dashboard', dongleId: OTHER }),
    });
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(actions.primeFetchSubscription).toHaveBeenCalledWith(OTHER, expect.objectContaining({ dongle_id: OTHER }));
    expect(actions.fetchDeviceOnline).toHaveBeenCalledWith(OTHER);
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('resolves a legacy timestamp URL after startup', () => {
    const { invoke } = create({ startupComplete: true, devices: [device(DONGLE)] });
    const start = 1_786_017_600_000;
    const end = start + 60_000;
    invoke({ pathname: `/${DONGLE}/${start}/${end}`, search: '' });
    expect(actions.resolveLegacyRange).toHaveBeenCalledWith(DONGLE, start, end);
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
  });

  it('replaces malformed URLs with their canonical page', () => {
    const { invoke } = create();
    invoke({ pathname: `/${DONGLE}/${LOG}/20/10`, search: '?source=share' });
    expect(replace).toHaveBeenCalledWith(`/${DONGLE}?source=share`);
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
  });
});
