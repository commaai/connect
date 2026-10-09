import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  api: { auth: { isAuthenticated: vi.fn() }, routes: { getRoutesSegments: vi.fn() } },
}));
vi.mock('../utils/webrtc', () => ({ webrtcConnectionManager: { disconnect: vi.fn() } }));
vi.mock('../timeline/playback', () => ({
  resetPlayback: () => ({ action: 'resetPlayback' }),
  selectLoop: (start, end) => ({ action: 'selectLoop', args: [start, end] }),
}));
vi.mock('./index', () => ({ checkRoutesData: vi.fn(), fetchDeviceOnline: vi.fn(), loadDevice: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

const before = { dongleId: DONGLE, zoom: null, profile: { id: 'user' }, device: { dongle_id: DONGLE } };

// the middleware between a store that goes from `previous` to `state` when the url is applied
function visit(pathname, state = before, previous = before) {
  let current = previous;
  const dispatched = [];
  const store = {
    getState: () => current,
    dispatch: (action) => (typeof action === 'function' ? action(store.dispatch, store.getState) : dispatched.push(action)),
  };
  const next = vi.fn(() => { current = state; });
  const action = { type: LOCATION_CHANGE, payload: { location: { pathname, search: '' } } };
  onHistoryMiddleware(store)(next)(action);
  return { dispatched, next, action };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.auth.isAuthenticated.mockReturnValue(true);
  for (const name of ['checkRoutesData', 'fetchDeviceOnline', 'loadDevice']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action and passes other actions through', () => {
    const next = vi.fn(() => 'result');
    const middleware = onHistoryMiddleware({ getState: vi.fn(), dispatch: vi.fn() })(next);
    expect(middleware()).toBeUndefined();
    expect(middleware({ type: 'TEST' })).toBe('result');
    expect(next).toHaveBeenCalledExactlyOnceWith({ type: 'TEST' });
  });

  it('lets the reducer apply the url, then loads the page', () => {
    const { dispatched, next, action } = visit(`/${DONGLE}`);
    expect(next).toHaveBeenCalledExactlyOnceWith(action);
    expect(dispatched).toEqual([{ action: 'checkRoutesData', args: [] }]);
    expect(localStorage.getItem('selectedDongleId')).toBeNull();
  });

  it('remembers and loads a device that was switched to', () => {
    const { dispatched } = visit(`/${OTHER}`, { ...before, dongleId: OTHER, device: { dongle_id: OTHER } });
    expect(localStorage.getItem('selectedDongleId')).toBe(OTHER);
    expect(webrtcConnectionManager.disconnect).toHaveBeenCalledOnce();
    expect(dispatched).toEqual([
      { action: 'loadDevice', args: [OTHER] },
      { action: 'fetchDeviceOnline', args: [OTHER] },
      { action: 'checkRoutesData', args: [] },
    ]);
  });

  it('restarts playback for a new range', () => {
    const { dispatched } = visit(`/${DONGLE}/${LOG}/10/20`, { ...before, zoom: { start: 10000, end: 20000 } });
    expect(dispatched.slice(0, 2)).toEqual([
      { action: 'resetPlayback' },
      { action: 'selectLoop', args: [10000, 20000] },
    ]);
  });

  it('loads nothing behind the sign in page, but does for a shared drive', () => {
    api.auth.isAuthenticated.mockReturnValue(false);
    expect(visit(`/${DONGLE}`).dispatched).toEqual([]);
    expect(visit(`/${DONGLE}/prime`).dispatched).toEqual([]);
    expect(visit(`/${DONGLE}/${LOG}`).dispatched).toEqual([{ action: 'checkRoutesData', args: [] }]);
  });

  describe('old links', () => {
    const legacy = { ...before, page: 'legacy' };

    it('are replaced by the url of the drive they point at', async () => {
      api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
      const { dispatched } = visit(`/${DONGLE}/1000/2000`, legacy);
      expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
      await vi.waitFor(() => expect(dispatched).toContainEqual(replace(`/${DONGLE}/${LOG}`)));
    });

    it.each([
      ['nothing is found', () => api.routes.getRoutesSegments.mockResolvedValue([])],
      ['the lookup fails', () => api.routes.getRoutesSegments.mockRejectedValue(new Error('lookup failed'))],
    ])('stay as they are when %s', async (_name, arrange) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      arrange();
      const { dispatched } = visit(`/${DONGLE}/1000/2000`, legacy);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dispatched).toEqual([{ action: 'checkRoutesData', args: [] }]);
      consoleError.mockRestore();
    });

    it('do not pull the visitor back once they have moved on', async () => {
      api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
      const { dispatched } = visit(`/${DONGLE}/1000/2000`, { ...before, page: 'dashboard' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dispatched).toEqual([{ action: 'checkRoutesData', args: [] }]);
    });
  });
});
