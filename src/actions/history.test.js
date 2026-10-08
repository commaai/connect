import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { onHistoryMiddleware, syncStateFromUrl } from './history';
import * as Types from './types';
import { checkRoutesData, checkLastRoutesData, fetchDeviceOnline, primeFetchSubscription } from './index';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

vi.mock('@commaai/my-comma-auth', () => ({
  default: { isAuthenticated: vi.fn(() => true), logOut: vi.fn() },
}));

vi.mock('../api/backend', () => ({
  api: {
    account: { getProfile: vi.fn(async () => ({ id: 'user-1' })) },
    devices: {
      fetchDevice: vi.fn(async (dongleId) => ({ dongle_id: dongleId, is_owner: false })),
      listDevices: vi.fn(async () => []),
    },
    routes: { getRoutesSegments: vi.fn() },
  },
}));

vi.mock('../utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));

vi.mock('./index', () => ({
  checkRoutesData: vi.fn(() => ({ type: 'checkRoutesData' })),
  checkLastRoutesData: vi.fn(() => ({ type: 'checkLastRoutesData' })),
  fetchDeviceOnline: vi.fn((dongleId) => ({ type: 'fetchDeviceOnline', dongleId })),
  primeFetchSubscription: vi.fn((dongleId) => ({ type: 'primeFetchSubscription', dongleId })),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = {
  dongleId: DONGLE,
  zoom: null,
  segmentRange: null,
  primeNav: false,
  streamNav: false,
  devices: [{ dongle_id: DONGLE, is_owner: true }, { dongle_id: OTHER, is_owner: true }],
  profile: { id: 'user-1' },
  routes: null,
  router: { location: { pathname: `/${DONGLE}` } },
};

function create(state = baseState) {
  let currentState = state;
  const dispatched = [];
  const store = {
    getState: vi.fn(() => currentState),
    dispatch: vi.fn((action) => {
      dispatched.push(action);
      if (typeof action === 'function') return action(store.dispatch, store.getState);
      return action;
    }),
  };
  const next = vi.fn((action) => {
    if (action.type === LOCATION_CHANGE) {
      currentState = {
        ...currentState,
        router: { location: { pathname: action.payload.location.pathname } },
      };
    }
    return action;
  });
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke, dispatched };
}

function location(pathname, action = 'POP') {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.account.getProfile.mockResolvedValue({ id: 'user-1' });
  api.devices.listDevices.mockResolvedValue([]);
  api.devices.fetchDevice.mockImplementation(async (dongleId) => ({ dongle_id: dongleId, is_owner: false }));
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next, invoke } = create();
    invoke();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through non-history actions', () => {
    const { next, invoke, store } = create();
    const action = { type: 'TEST' };
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('syncs every location change through a thunk', () => {
    const { next, invoke, store } = create();
    const action = location(`/${OTHER}`, 'PUSH');
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('syncStateFromUrl', () => {
  it('applies a dashboard destination and loads dashboard data', async () => {
    const { store } = create({ ...baseState, router: { location: { pathname: `/${OTHER}` } } });
    await syncStateFromUrl(`/${OTHER}`)(store.dispatch, store.getState);

    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(store.dispatch).toHaveBeenCalledWith({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: { dongleId: OTHER, page: 'dashboard', drive: null },
    });
    expect(fetchDeviceOnline).toHaveBeenCalledWith(OTHER);
    expect(primeFetchSubscription).toHaveBeenCalledWith(OTHER, baseState.devices[1], baseState.profile);
    expect(checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('applies a drive destination and fetches route metadata', async () => {
    const { store } = create({ ...baseState, router: { location: { pathname: `/${DONGLE}/${LOG}/10/20` } } });
    await syncStateFromUrl(`/${DONGLE}/${LOG}/10/20`)(store.dispatch, store.getState);

    expect(store.dispatch).toHaveBeenCalledWith({
      type: Types.ACTION_APPLY_DESTINATION,
      destination: {
        dongleId: DONGLE,
        page: 'drive',
        drive: { logId: LOG, start: 10000, end: 20000 },
      },
    });
    expect(checkRoutesData).toHaveBeenCalledOnce();
  });

  it('rewrites a legacy timestamp URL to the canonical route URL', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { store } = create({ ...baseState, router: { location: { pathname: `/${DONGLE}/1000/2000` } } });
    await syncStateFromUrl(`/${DONGLE}/1000/2000`)(store.dispatch, store.getState);

    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(store.dispatch).toHaveBeenCalledWith({
      type: '@@router/CALL_HISTORY_METHOD',
      payload: { method: 'replace', args: [`/${DONGLE}/${LOG}`] },
    });
  });
});
