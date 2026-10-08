import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { drives as Drives } from '../api';
import { onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api', () => ({ account: {}, auth: {}, billing: {}, devices: {}, drives: { getRoutesSegments: vi.fn() }, raw: {}, video: {} }));
vi.mock('./index', () => ({ setDevice: vi.fn(), selectRoute: vi.fn(), checkRoutesData: vi.fn() }));
const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const LEGACY = `/${DONGLE}/1000/2000`;

function harness() {
  const state = { dongleId: DONGLE, router: { location: { pathname: '/' } } };
  const dispatch = vi.fn(action => typeof action === 'function' ? action(dispatch, () => state) : action);
  const next = vi.fn(action => { if (action.type === LOCATION_CHANGE) state.router.location = action.payload.location; });
  const middleware = onHistoryMiddleware({ dispatch, getState: () => state })(next);
  const visit = (pathname, search = '', type = 'PUSH') => middleware({ type: LOCATION_CHANGE, payload: { action: type, location: { pathname, search } } });
  return { dispatch, next, middleware, visit };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['setDevice', 'selectRoute', 'checkRoutesData']) actions[name].mockImplementation((...args) => ({ type: name, args }));
});

describe('location reconciliation', () => {
  it.each(['PUSH', 'POP', 'REPLACE'])('applies %s after publishing the location', type => {
    const { visit } = harness();
    visit(`/${DONGLE}/${LOG}/10.001/20.002`, '', type);
    expect(actions.selectRoute).toHaveBeenCalledWith(LOG, { start: 10001, end: 20002 });
    expect(actions.checkRoutesData).toHaveBeenCalledOnce();
  });

  it('does not reconcile drive state for query-only changes', () => {
    const { visit } = harness();
    visit(`/${DONGLE}/${LOG}`);
    vi.clearAllMocks();
    visit(`/${DONGLE}/${LOG}`, '?dialog=settings');
    expect(actions.selectRoute).not.toHaveBeenCalled();
    expect(actions.checkRoutesData).not.toHaveBeenCalled();
  });

  it('switches device before selecting and fetching the drive', () => {
    const { visit, dispatch } = harness();
    visit(`/1111bbbb1111bbbb/${LOG}`);
    expect(dispatch.mock.calls.filter(([action]) => typeof action !== 'function').map(([action]) => action.type)).toEqual(['setDevice', 'selectRoute', 'checkRoutesData']);
  });

  it('replaces legacy links and preserves query arguments', async () => {
    const { visit, dispatch } = harness();
    Drives.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    visit(LEGACY, '?keep=yes');
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(replace({ pathname: `/${DONGLE}/${LOG}`, search: '?keep=yes' })));
  });

  it('ignores an older lookup even after leaving and returning to the same URL', async () => {
    const resolvers = [];
    Drives.getRoutesSegments.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const { visit, dispatch } = harness();
    visit(LEGACY);
    visit('/referrals');
    visit(LEGACY);
    resolvers[0]([{ fullname: `${DONGLE}|${LOG}` }]);
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: '@@router/CALL_HISTORY_METHOD' }));
    resolvers[1]([]);
  });

  it.each([null, []])('does not redirect an empty lookup %j', async result => {
    Drives.getRoutesSegments.mockResolvedValue(result);
    const { visit, dispatch } = harness();
    visit(LEGACY);
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: '@@router/CALL_HISTORY_METHOD' }));
  });

  it('handles failed lookups', async () => {
    const error = new Error('lookup failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    Drives.getRoutesSegments.mockRejectedValue(error);
    harness().visit(LEGACY);
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    log.mockRestore();
  });
});
