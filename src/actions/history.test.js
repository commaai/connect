import { api } from '../api/backend';
import { vi, describe, it, expect } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';
import { onHistoryMiddleware } from './history';
import { ROUTE_CHANGED } from '../routing/actions';
import { parseUrl } from '../routing/routes';
vi.mock('./index', () => ({ selectDevice: (...args) => ({ type: 'select', args }), checkRoutesData: () => ({ type: 'load' }) }));
vi.mock('../api/backend', () => ({ api: { routes: { getRoutesSegments: vi.fn(async () => []) } } }));
const D = '0000aaaa0000aaaa';
describe('history pipeline', () => {
  it('ignores a legacy lookup that finishes after another navigation', async () => {
    let resolve;
    api.routes.getRoutesSegments.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const state = { dongleId: D, limit: 5 };
    const calls = [];
    const dispatch = a => { calls.push(a); if (a.type === ROUTE_CHANGED) state.route = a.route; };
    const invoke = onHistoryMiddleware({ getState: () => state, dispatch })(() => {});
    invoke({ type: LOCATION_CHANGE, payload: { location: { pathname: '/' + D + '/1000/2000' } } });
    invoke({ type: LOCATION_CHANGE, payload: { location: { pathname: '/' + D + '/prime' } } });
    resolve([{ fullname: D + '|2026-08-06--12-00-00' }]);
    await Promise.resolve();
    expect(calls.some(a => a.type === '@@router/CALL_HISTORY_METHOD')).toBe(false);
    expect(state.route.page).toBe('prime');
  });
  it.each(['PUSH', 'POP', 'REPLACE'])('synchronizes %s in the same order', action => {
    const calls = [];
    const state = { dongleId: D, limit: 5 };
    const location = { pathname: `/${D}/prime`, search: '' };
    onHistoryMiddleware({ getState: () => state, dispatch: a => calls.push(a) })(a => calls.push(a))({ type: LOCATION_CHANGE, payload: { action, location } });
    expect(calls.map(a => a.type)).toEqual([LOCATION_CHANGE, ROUTE_CHANGED, 'load']);
    expect(calls[1].route).toEqual(parseUrl(location));
  });
  it('switches the device before applying the drive selection', () => {
    const dispatch = vi.fn();
    onHistoryMiddleware({ dispatch, getState: () => ({ dongleId: '1111bbbb1111bbbb', limit: 5 }) })(vi.fn())({ type: LOCATION_CHANGE, payload: { action: 'PUSH', location: { pathname: `/${D}` } } });
    expect(dispatch.mock.calls[0][0]).toEqual({ type: 'select', args: [D, false, false] });
    expect(dispatch.mock.calls[1][0].type).toBe(ROUTE_CHANGED);
  });
});
