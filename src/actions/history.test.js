import { vi } from 'vitest';
import { replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware, syncStateFromURL } from './history';
import { ACTION_APPLY_DESTINATION } from './types';
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
  checkRoutesData: vi.fn(), checkLastRoutesData: vi.fn(),
  primeFetchSubscription: vi.fn(), fetchDeviceOnline: vi.fn(), fetchSharedDevice: vi.fn(),
}));
vi.mock('../timeline', () => ({
  currentOffset: vi.fn(() => 0),
}));
vi.mock('../utils/webrtc', () => ({
  webrtcConnectionManager: { disconnect: vi.fn() },
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const baseState = { dongleId: DONGLE, zoom: null, selectedRouteId: null, router: { location: { pathname: '/', search: '' } }};

function create(state = baseState) {
  const store = { getState: vi.fn(() => state), dispatch: vi.fn() };
  const next = vi.fn();
  const invoke = (action) => onHistoryMiddleware(store)(next)(action);
  return { store, next, invoke };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('history middleware', () => {
  it('skips synchronization for non-history actions', () => {
    const action = { type: 'TEST' };
    const { store, next, invoke } = create();
    invoke(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('selects a changed device and refreshes routes', async () => {
    const { store } = create({ ...baseState, router: { location: { pathname: `/${OTHER}`, search: '' } } });
    await syncStateFromURL()(store.dispatch, store.getState);
    expect(store.dispatch).toHaveBeenCalledWith({
      type: ACTION_APPLY_DESTINATION,
      destination: { dongleId: OTHER, routeId: null, range: undefined },
    });
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const pathname = `/${DONGLE}/1000/2000`;
    const { store } = create({ ...baseState, router: { location: { pathname, search: '' } } });
    await syncStateFromURL()(store.dispatch, store.getState);
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(store.dispatch).toHaveBeenCalledWith(replace({ pathname: `/${DONGLE}/${LOG}`, search: '' }));
  });
});
