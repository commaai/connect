/* eslint-disable no-import-assign */
import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { drives as Drives } from '../api';
import { onHistoryMiddleware } from './history';
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
  selectDevice: vi.fn(), selectDrive: vi.fn(), checkLastRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// Runs one action through the middleware the way the store would, running
// thunks and recording every plain action they dispatch.
function run(action, state = { dongleId: DONGLE }) {
  const dispatched = [];
  const dispatch = (a) => (typeof a === 'function' ? a(dispatch, () => state) : dispatched.push(a));
  const next = vi.fn();
  onHistoryMiddleware({ dispatch, getState: () => state })(next)(action);
  return { dispatched, next };
}

function location(pathname, action = 'PUSH', state = undefined) {
  return { type: LOCATION_CHANGE, payload: { action, location: { pathname, state } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'selectDrive', 'checkLastRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('ignores an absent action', () => {
    const { next } = run();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes other actions through', () => {
    const { dispatched, next } = run({ type: 'TEST' });
    expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    expect(dispatched).toEqual([]);
  });

  it.each(['PUSH', 'POP', 'REPLACE'])('applies a URL reached by %s', (historyAction) => {
    const action = location(`/${OTHER}/${LOG}/10/20`, historyAction);
    const { dispatched, next } = run(action);
    expect(next).toHaveBeenCalledWith(action);
    expect(dispatched).toEqual([
      { action: 'selectDevice', args: [OTHER, false] },
      { action: 'selectDrive', args: [LOG, { start: 10000, end: 20000 }] },
      { action: 'checkLastRoutesData', args: [] },
    ]);
  });

  it.each([`/${DONGLE}`, '/referrals', '/'])('keeps the selected device at %s', (pathname) => {
    const { dispatched } = run(location(pathname));
    expect(dispatched).toEqual([{ action: 'selectDrive', args: [null, null] }]);
  });

  it('applies the page a modal was opened over', () => {
    const { dispatched } = run(location(`/${OTHER}/settings`, 'PUSH', { background: `/${DONGLE}/${LOG}` }));
    expect(dispatched).toEqual([{ action: 'selectDrive', args: [LOG, null] }]);
  });

  it('redirects an old time range link to its drive', async () => {
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const { dispatched } = run(location(`/${DONGLE}/1000/2000`, 'POP'));
    await vi.waitFor(() => expect(dispatched).toContainEqual(replace(`/${DONGLE}/${LOG}`)));
    expect(Drives.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
  });

  it.each([['nothing', null], ['no drives', []]])('keeps an old time range link when the lookup returns %s', async (_name, routes) => {
    Drives.getRoutesSegments.mockResolvedValue(routes);
    const { dispatched } = run(location(`/${DONGLE}/1000/2000`, 'POP'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatched).toEqual([{ action: 'selectDrive', args: [null, null] }]);
  });

  it('keeps an old time range link when the lookup fails', async () => {
    const error = new Error('lookup failed');
    Drives.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dispatched } = run(location(`/${DONGLE}/1000/2000`, 'POP'));
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(dispatched).toEqual([{ action: 'selectDrive', args: [null, null] }]);
    consoleError.mockRestore();
  });
});
