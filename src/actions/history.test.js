import { vi } from 'vitest';
import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { applyUrl, onHistoryMiddleware } from './history';
import * as actions from './index';

vi.mock('../api/backend', () => ({
  api: { auth: { isAuthenticated: vi.fn(() => true) }, routes: { getRoutesSegments: vi.fn() } },
}));
vi.mock('./index', () => ({
  selectDevice: vi.fn(), selectRoute: vi.fn(), checkRouteData: vi.fn(), checkRoutesData: vi.fn(),
}));

const DONGLE = '0000aaaa0000aaaa';
const OTHER = '1111bbbb1111bbbb';
const LOG = '2026-08-06--12-00-00';

// applies a url to a fixed state and collects what it dispatches
function visit(url, state = { dongleId: DONGLE }) {
  const [pathname, search = ''] = url.split('?');
  const location = { pathname, search };
  const getState = () => ({ ...state, router: { location } });
  const dispatched = [];
  const dispatch = (action) => (typeof action === 'function' ? action(dispatch, getState) : dispatched.push(action));
  dispatch(applyUrl());
  return dispatched;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['selectDevice', 'selectRoute', 'checkRouteData', 'checkRoutesData']) {
    actions[name].mockImplementation((...args) => ({ action: name, args }));
  }
});

describe('history middleware', () => {
  it('applies the url after the router has stored a location change', () => {
    const order = [];
    const next = vi.fn(() => order.push('stored'));
    const dispatch = vi.fn(() => order.push('applied'));
    onHistoryMiddleware({ dispatch })(next)({ type: LOCATION_CHANGE });
    expect(order).toEqual(['stored', 'applied']);
  });

  it('passes every other action on untouched', () => {
    const next = vi.fn(() => 'result');
    const dispatch = vi.fn();
    expect(onHistoryMiddleware({ dispatch })(next)({ type: 'TEST' })).toBe('result');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('applyUrl', () => {
  it('selects the device of the url, once', () => {
    visit(`/${OTHER}`);
    expect(actions.selectDevice).toHaveBeenCalledWith(OTHER);
    vi.clearAllMocks();
    visit(`/${OTHER}/prime`, { dongleId: OTHER });
    expect(actions.selectDevice).not.toHaveBeenCalled();
  });

  it('keeps the selected device on a page without one', () => {
    visit('/referrals');
    expect(actions.selectDevice).not.toHaveBeenCalled();
    expect(actions.selectRoute).toHaveBeenCalledWith(null, null);
  });

  it('sends / to the selected device, and waits while there is none', () => {
    expect(visit('/')).toEqual([replace(`/${DONGLE}`)]);
    expect(visit('/', { dongleId: null })).toEqual([]);
  });

  it.each([
    [`/${DONGLE}`, null, null, 'checkRoutesData'],
    [`/${DONGLE}/settings`, null, null, 'checkRoutesData'],
    [`/${DONGLE}/${LOG}`, LOG, null, 'checkRouteData'],
    [`/${DONGLE}/${LOG}/0/20`, LOG, { start: 0, end: 20000 }, 'checkRouteData'],
    [`/${DONGLE}/${LOG}/20/20`, LOG, null, 'checkRouteData'],
    [`/${DONGLE}/${LOG}/20/10`, LOG, null, 'checkRouteData'],
  ])('selects the drive and zoom of %s, then loads what is missing', (pathname, routeId, zoom, load) => {
    const dispatched = visit(pathname);
    expect(actions.selectRoute).toHaveBeenCalledWith(routeId, zoom);
    expect(dispatched.at(-1)).toEqual({ action: load, args: [] });
  });

  it.each([
    [`/${DONGLE}`, false],
    [`/${DONGLE}/prime`, false],
    ['/referrals', false],
    [`/${DONGLE}/${LOG}`, true],
    [`/${DONGLE}/${LOG}/0/20`, true],
    [`/${DONGLE}/1000/2000`, true],
  ])('leaves %s to the login page when signed out, unless it is a drive', (pathname, isPublic) => {
    api.auth.isAuthenticated.mockReturnValueOnce(false);
    api.routes.getRoutesSegments.mockResolvedValue([]);
    expect(visit(pathname).length > 0).toBe(isPublic);
  });

  it.each([
    [`/${OTHER}/prime`, `/${OTHER}/prime`],
    ['//evil.example/path', '/'],
    [`/${OTHER}/../../evil`, `/${OTHER}`],
  ])('follows the login redirect %s only to one of our pages', (redirect, expected) => {
    expect(visit(`/?r=${encodeURIComponent(redirect)}`)).toEqual([replace(expected)]);
  });

  it('replaces a legacy link with the drive recorded in its time range', async () => {
    api.routes.getRoutesSegments.mockResolvedValue([{ fullname: `${DONGLE}|${LOG}` }]);
    const dispatched = visit(`/${DONGLE}/1000/2000`);
    expect(api.routes.getRoutesSegments).toHaveBeenCalledWith(DONGLE, 1000, 2000);
    await vi.waitFor(() => expect(dispatched).toContainEqual(replace(`/${DONGLE}/${LOG}`)));
  });

  it.each([null, []])('keeps a legacy link when no drive is found (%j)', async (routes) => {
    api.routes.getRoutesSegments.mockResolvedValue(routes);
    const dispatched = visit(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(api.routes.getRoutesSegments).toHaveBeenCalled());
    expect(dispatched.map(({ action }) => action)).toEqual(['selectRoute', 'checkRoutesData']);
  });

  it('keeps a legacy link when the lookup fails', async () => {
    const error = new Error('lookup failed');
    api.routes.getRoutesSegments.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatched = visit(`/${DONGLE}/1000/2000`);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('Error fetching routes data for log ID conversion', error));
    expect(dispatched.map(({ action }) => action)).toEqual(['selectRoute', 'checkRoutesData']);
    consoleError.mockRestore();
  });
});
