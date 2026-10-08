import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { applyUrl, onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn() } } }));
vi.mock('./index', () => ({ checkRoutesData: vi.fn(), selectDevice: vi.fn(), selectDrive: vi.fn() }));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

function apply(pathname, state = {}) {
  const dispatch = vi.fn((action) => (typeof action === 'function' ? action(dispatch, getState) : action));
  const getState = () => ({ dongleId: DONGLE, router: { location: { pathname } }, ...state });
  applyUrl(pathname)(dispatch, getState);
  return dispatch;
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.checkRoutesData.mockReturnValue({ type: 'checkRoutesData' });
  actions.selectDevice.mockImplementation((dongleId) => ({ type: 'selectDevice', dongleId }));
  actions.selectDrive.mockImplementation((logId, zoom) => ({ type: 'selectDrive', logId, zoom }));
});

describe('history middleware', () => {
  it.each(['PUSH', 'POP', 'REPLACE'])('applies the URL after a %s', (historyAction) => {
    const dispatch = vi.fn();
    const next = vi.fn();
    const action = { type: LOCATION_CHANGE, payload: { action: historyAction, location: { pathname: `/${DONGLE}` } } };
    onHistoryMiddleware({ dispatch })(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('passes other actions through', () => {
    const dispatch = vi.fn();
    const next = vi.fn(() => 'result');
    expect(onHistoryMiddleware({ dispatch })(next)({ type: 'TEST' })).toBe('result');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('applyUrl', () => {
  it('keeps the current device', () => {
    apply(`/${DONGLE}/prime`);
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.selectDrive).toHaveBeenCalledWith(null, null);
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('switches to the device in the URL', () => {
    const dispatch = apply(`/${OTHER}`);
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectDevice', dongleId: OTHER });
  });

  it.each(['/', '/referrals'])('keeps the selected device on %s', (pathname) => {
    apply(pathname);
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it.each([
    [`/${DONGLE}/${LOG}`, null],
    [`/${DONGLE}/${LOG}/10/20`, { start: 10000, end: 20000 }],
  ])('opens the drive in %s', (pathname, zoom) => {
    apply(pathname);
    expect(actions.selectDrive).toHaveBeenCalledWith(LOG, zoom);
  });

  it('replaces a legacy range with its drive', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatch = apply(`/${DONGLE}/1000/2000`);
    expect(actions.selectDrive).toHaveBeenCalledWith(null, null);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(replace(`/${DONGLE}/${LOG}`)));
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it('keeps a legacy range after the user moved on', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatch = apply(`/${DONGLE}/1000/2000`, { router: { location: { pathname: `/${DONGLE}` } } });
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ method: 'replace' }) }));
  });

  it.each([
    ['empty', () => api.routes.getRoutesSegments.mockResolvedValue([])],
    ['failed', () => api.routes.getRoutesSegments.mockRejectedValue(new Error('lookup failed'))],
  ])('keeps a legacy range after an %s lookup', async (_name, mockLookup) => {
    mockLookup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatch = apply(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ method: 'replace' }) }));
    consoleError.mockRestore();
  });
});
