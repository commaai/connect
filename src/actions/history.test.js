/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

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
const baseState = { dongleId: DONGLE, zoom: null, selectedRouteId: null };

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
  it('passes through a non-history action', () => {
    const { store, next, invoke } = create();
    const action = { type: 'TEST' };

    invoke(action);

    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('syncs %s navigation', (historyAction) => {
    const { store, next, invoke } = create();
    const action = {
      type: LOCATION_CHANGE,
      payload: { action: historyAction, location: { pathname: `/${DONGLE}` } },
    };

    invoke(action);

    expect(next).toHaveBeenCalledWith(action);
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it.each([
    ['dashboard', `/${DONGLE}`, { page: 'dashboard', dongleId: DONGLE }],
    ['drive', `/${DONGLE}/${LOG}/10/20`, {
      page: 'drive', dongleId: DONGLE, logId: LOG, range: { start: 10000, end: 20000 },
    }],
    ['Prime', `/${DONGLE}/prime`, { page: 'prime', dongleId: DONGLE }],
    ['stream', `/${DONGLE}/stream`, { page: 'stream', dongleId: DONGLE }],
  ])('applies the %s destination', async (_name, pathname, destination) => {
    const { store } = create();

    await syncStateFromURL(pathname)(store.dispatch, store.getState);

    expect(store.dispatch).toHaveBeenCalledWith({ type: ACTION_APPLY_DESTINATION, destination });
    expect(actions.checkRoutesData).toHaveBeenCalledTimes(destination.page === 'drive' ? 1 : 0);
  });

  it('selects a changed device and refreshes routes', async () => {
    const { store } = create();

    await syncStateFromURL(`/${OTHER}`)(store.dispatch, store.getState);

    expect(store.dispatch).toHaveBeenCalledWith({
      type: ACTION_APPLY_DESTINATION,
      destination: { page: 'dashboard', dongleId: OTHER },
    });
    expect(actions.checkLastRoutesData).toHaveBeenCalledOnce();
  });

  it('converts a legacy timestamp range to a route', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const pathname = `/${DONGLE}/1000/2000`;
    const { store } = create({ ...baseState, router: { location: { pathname } } });

    await syncStateFromURL(pathname)(store.dispatch, store.getState);

    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    expect(store.dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`));
  });
});
