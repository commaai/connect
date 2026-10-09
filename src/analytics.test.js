import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { analyticsMiddleware } from './analytics';

vi.mock('./utils', () => ({ deviceIsOnline: vi.fn(() => false) }));
vi.mock('@commaai/my-comma-auth', () => ({
  default: { isAuthenticated: () => true },
}));

afterEach(() => vi.unstubAllGlobals());

describe('analytics middleware', () => {
  it.each([
    ['/demo/1000/2000', '/demo/<legacyStart>/<legacyEnd>'],
    ['/demo//1000/2000', '/demo/<legacyStart>/<legacyEnd>'],
    ['/demo/1000//2000', '/demo/<legacyStart>/<legacyEnd>'],
    ['/aaaaaaaaaaaaaaaa/1000/2000', '/<dongleId>/<legacyStart>/<legacyEnd>'],
  ])('masks legacy timestamps in %s', (pathname, pageLocation) => {
    const gtag = vi.fn();
    vi.stubGlobal('gtag', gtag);
    const location = { pathname, search: '', hash: '' };
    const getState = () => ({ profile: { user_id: 'test-user' }, router: { location } });
    const middleware = analyticsMiddleware({ getState })((action) => action);

    middleware({ type: LOCATION_CHANGE, payload: { location } });

    expect(gtag).toHaveBeenCalledWith('event', 'page_view', { page_location: pageLocation });
  });
});
