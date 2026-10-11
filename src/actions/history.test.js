import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { api } from '../api/backend';
import { onHistoryMiddleware } from './history';
import { ACTION_STARTUP_DATA } from './types';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('../timeline/playback', () => ({
  resetPlayback: () => ({ type: 'ACTION_RESET' }),
  selectLoop: (start, end) => ({ type: 'ACTION_LOOP', start, end }),
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('./index', () => ({
  checkLastRoutesData: vi.fn(() => 'checkLastRoutesData'),
  checkRoutesData: vi.fn(() => 'checkRoutesData'),
  fetchSelectedRoute: vi.fn(() => 'fetchSelectedRoute'),
  fetchDeviceOnline: vi.fn(() => 'fetchDeviceOnline'),
  fetchSharedDevice: vi.fn(() => 'fetchSharedDevice'),
  primeFetchSubscription: vi.fn(() => 'primeFetchSubscription'),
}));

const A = 'aaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbb';
const LOG = '2026-08-06--12-00-00';
const devices = [{ dongle_id: A }, { dongle_id: B }];

// runs the middleware with a fake reducer that moves from `before` to `after`
function run(action, before, after) {
  let state = before;
  const dispatch = vi.fn();
  const next = vi.fn(() => { state = after; });
  onHistoryMiddleware({ dispatch, getState: () => state })(next)(action);
  return { dispatch, next };
}

const loaded = { routes: [], routesMeta: { dongleId: A, start: 0, end: 1 }, filter: { start: 0, end: 1 } };
const at = (pathname, extra = {}) => ({ devices, dongleId: A, zoom: null, ...loaded, router: { location: { pathname } }, ...extra });
const change = { type: LOCATION_CHANGE, payload: {} };
const replaceTo = (url) => expect.objectContaining({ payload: { method: 'replace', args: [url] } });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('history middleware', () => {
  it('passes other actions through untouched', () => {
    const { dispatch, next } = run({ type: 'TEST' }, at('/'), at('/'));
    expect(next).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('opens the stored device from / once the devices arrive', () => {
    localStorage.setItem('selectedDongleId', B);
    const { dispatch } = run({ type: ACTION_STARTUP_DATA, devices }, at('/', { devices: null }), at('/'));
    expect(dispatch).toHaveBeenCalledWith(replaceTo(`/${B}`));
  });

  it('opens the first device from / when none is stored', () => {
    const { dispatch } = run(change, at('/'), at('/'));
    expect(dispatch).toHaveBeenCalledWith(replaceTo(`/${A}`));
  });

  it('loads the new device after a device change', () => {
    const { dispatch } = run(change, at(`/${A}`), at(`/${B}`, { dongleId: B }));
    expect(localStorage.getItem('selectedDongleId')).toBe(B);
    expect(dispatch.mock.calls.map(([a]) => a)).toEqual(['primeFetchSubscription', 'fetchDeviceOnline', 'checkLastRoutesData']);
  });

  it('fetches a device that is not in your list, at start-up and on a device change', () => {
    const shared = 'cccccccccccccccc';
    const atShared = at(`/${shared}`, { dongleId: shared });
    expect(run({ type: ACTION_STARTUP_DATA }, atShared, atShared).dispatch).toHaveBeenCalledWith('fetchSharedDevice');
    expect(run(change, at(`/${A}`), atShared).dispatch).toHaveBeenCalledWith('fetchSharedDevice');
  });

  it('fetches nothing when only the page changes', () => {
    const { dispatch } = run(change, at(`/${A}`), at(`/${A}/prime`));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fetches a drive that is not in the loaded list', () => {
    const { dispatch } = run(change, at(`/${A}`), at(`/${A}/${LOG}`, { selectedRouteId: LOG, currentRoute: null }));
    expect(dispatch).toHaveBeenCalledWith('fetchSelectedRoute');
  });

  it('fetches the drive list when only one drive was loaded', () => {
    const oneDrive = { routesMeta: { ...loaded.routesMeta, routeId: LOG } };
    const { dispatch } = run(change, at(`/${A}/${LOG}`, oneDrive), at(`/${A}`, oneDrive));
    expect(dispatch).toHaveBeenCalledWith('checkRoutesData');
  });

  it('replaces a legacy link with the drive it points at', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${A}|${LOG}` }]);
    const legacy = at(`/${A}/1000/2000`);
    const { dispatch } = run(change, at(`/${A}`), legacy);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(replaceTo(`/${A}/${LOG}`)));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(A, 1000, 2000);
  });

  it('restarts playback on a new range', () => {
    const zoom = { start: 10000, end: 20000 };
    const { dispatch } = run(change, at(`/${A}/${LOG}`), at(`/${A}/${LOG}/10/20`, { zoom }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ACTION_LOOP', start: 10000, end: 20000 }));
  });
});
