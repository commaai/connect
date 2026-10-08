import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { onHistoryMiddleware } from './history';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../timeline/playback', () => ({
  resetPlayback: () => ({ type: 'resetPlayback' }),
  selectLoop: (start, end) => ({ type: 'selectLoop', start, end }),
}));
vi.mock('./index', () => ({
  checkLastRoutesData: () => ({ type: 'checkLastRoutesData' }),
  fetchDeviceOnline: (dongleId) => ({ type: 'fetchDeviceOnline', dongleId }),
  fetchSharedDevice: (dongleId) => ({ type: 'fetchSharedDevice', dongleId }),
  primeFetchSubscription: (dongleId) => ({ type: 'primeFetchSubscription', dongleId }),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';
const devices = [{ dongle_id: DONGLE, is_owner: true }, { dongle_id: OTHER, is_owner: true }];

function stateAt(pathname, fields = {}) {
  return { dongleId: DONGLE, devices, device: devices[0], zoom: null, router: { location: { pathname } }, ...fields };
}

// Runs a URL change through the middleware, with the reducer turning `before`
// into `after`, and returns the plain actions that were dispatched.
function navigate(before, after) {
  let state = before;
  const dispatched = [];
  const store = {
    getState: () => state,
    dispatch: (action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : dispatched.push(action)),
  };
  const next = vi.fn(() => { state = after; });
  const pathname = after.router.location.pathname;
  onHistoryMiddleware(store)(next)({ type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname } } });
  expect(next).toHaveBeenCalledOnce();
  return dispatched;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const next = vi.fn();
    onHistoryMiddleware({})(next)(undefined);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through', () => {
    const next = vi.fn(() => 'result');
    const store = { getState: vi.fn(), dispatch: vi.fn() };
    expect(onHistoryMiddleware(store)(next)({ type: 'TEST' })).toBe('result');
    expect(store.getState).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing more when staying on the same device', () => {
    expect(navigate(stateAt(`/${DONGLE}`), stateAt(`/${DONGLE}/prime`))).toEqual([]);
  });

  it('loads a newly opened device', () => {
    const dispatched = navigate(stateAt(`/${DONGLE}`), stateAt(`/${OTHER}`, { dongleId: OTHER, device: devices[1] }));
    expect(dispatched).toEqual([
      { type: 'primeFetchSubscription', dongleId: OTHER },
      { type: 'fetchDeviceOnline', dongleId: OTHER },
      { type: 'checkLastRoutesData' },
    ]);
    expect(localStorage.getItem('selectedDongleId')).toBe(OTHER);
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
  });

  it('fetches a device that is not in the device list', () => {
    const shared = 'cccccccccccccccc';
    const dispatched = navigate(stateAt(`/${DONGLE}`), stateAt(`/${shared}`, { dongleId: shared, device: null }));
    expect(dispatched).toEqual([{ type: 'fetchSharedDevice', dongleId: shared }, { type: 'checkLastRoutesData' }]);
  });

  it('restarts playback for a new zoom', () => {
    const zoom = { start: 1000, end: 2000 };
    const dispatched = navigate(stateAt(`/${DONGLE}`), stateAt(`/${DONGLE}/${LOG}/1/2`, { zoom }));
    expect(dispatched).toEqual([{ type: 'resetPlayback' }, { type: 'selectLoop', start: 1000, end: 2000 }]);
  });

  it('clears the loop when closing a drive', () => {
    const dispatched = navigate(stateAt(`/${DONGLE}/${LOG}`, { zoom: { start: 0, end: 60000 } }), stateAt(`/${DONGLE}`));
    expect(dispatched).toEqual([{ type: 'resetPlayback' }, { type: 'selectLoop', start: undefined, end: undefined }]);
  });

  it('replaces a legacy time range with the drive it covers', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatched = navigate(stateAt(`/${DONGLE}`), stateAt(`/${DONGLE}/1000/2000`));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    await vi.waitFor(() => expect(dispatched).toEqual([replace(`/${DONGLE}/${LOG}`)]));
  });

  it.each([['no drives', async () => []], ['an error', async () => { throw new Error('lookup failed'); }]])(
    'keeps a legacy time range after %s',
    async (_name, lookup) => {
      api.routes.getRoutesSegments.mockImplementation(lookup);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const dispatched = navigate(stateAt(`/${DONGLE}`), stateAt(`/${DONGLE}/1000/2000`));
      await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dispatched).toEqual([]);
      consoleError.mockRestore();
    },
  );

  describe('a URL without a device', () => {
    it('opens the current device', () => {
      expect(navigate(stateAt('/referrals', { dongleId: OTHER }), stateAt('/', { dongleId: OTHER }))).toEqual([replace(`/${OTHER}`)]);
    });

    it('opens the device picked last time', () => {
      localStorage.setItem('selectedDongleId', OTHER);
      expect(navigate(stateAt('/referrals', { dongleId: null }), stateAt('/', { dongleId: null }))).toEqual([replace(`/${OTHER}`)]);
    });

    it('opens the first device', () => {
      localStorage.setItem('selectedDongleId', 'dddddddddddddddd');
      expect(navigate(stateAt('/referrals', { dongleId: null }), stateAt('/', { dongleId: null }))).toEqual([replace(`/${DONGLE}`)]);
    });

    it('waits for the device list', () => {
      expect(navigate(stateAt('/', { dongleId: null, devices: null }), stateAt('/', { dongleId: null, devices: null }))).toEqual([]);
    });

    it('stays on a page that needs no device', () => {
      expect(navigate(stateAt('/', { dongleId: null }), stateAt('/referrals', { dongleId: null }))).toEqual([]);
    });
  });
});
