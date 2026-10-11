import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import './store'; // load the store first: analytics and the store import each other
import { analyticsMiddleware } from './analytics';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));

const A = 'aaaaaaaaaaaaaaaa';
const LOG = '2026-08-06--12-00-00';

function events(before, after, pathname) {
  const gtag = vi.fn();
  vi.stubGlobal('gtag', gtag);
  let state = before;
  analyticsMiddleware({ getState: () => state })(() => { state = after; })({
    type: LOCATION_CHANGE, payload: { location: { pathname } },
  });
  return gtag.mock.calls.filter(([kind]) => kind === 'event').map(([, name, params]) => [name, params]);
}

describe('analytics on url changes', () => {
  it('counts a page view with the ids hidden', () => {
    expect(events({ dongleId: A }, { dongleId: A }, `/${A}/${LOG}/10/20`))
      .toEqual([['page_view', { page_location: `/<dongleId>/${LOG}/<zoomStart>/<zoomEnd>` }]]);
  });

  it('counts selecting a device', () => {
    expect(events({ dongleId: null }, { dongleId: A }, `/${A}`).map(([name]) => name)).toEqual(['page_view', 'select_device']);
  });

  it('counts selecting a range', () => {
    const zoom = { start: 10000, end: 20000 };
    expect(events({ dongleId: A, zoom: null }, { dongleId: A, zoom }, `/${A}/${LOG}/10/20`).map(([name]) => name))
      .toEqual(['page_view', 'select_zoom']);
  });
});
