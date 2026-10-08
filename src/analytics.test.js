import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

import { analyticsMiddleware } from './analytics';

vi.mock('@commaai/my-comma-auth', () => ({
  default: {
    init: vi.fn(async () => 'test-token'),
    isAuthenticated: vi.fn(() => true),
    logOut: vi.fn(),
  },
  config: { AUTH_PATH: '/auth/' },
  storage: { setCommaAccessToken: vi.fn() },
}));
// analytics -> utils -> timeline -> store is a load cycle; keep the test off it.
vi.mock('./utils', () => ({ deviceIsOnline: vi.fn(() => false) }));

const gtagCalls = () => globalThis.gtag.mock.calls.map((args) => (
  // page_view uses the 3-arg gtag('event', name, params) form; tag() emits
  // the 2-arg gtag(name, params) form.
  args.length >= 3
    ? { event: args[0], name: args[1], params: args[2] }
    : { event: 'event', name: args[0], params: args[1] }
));

function runLocationChange(prev, next) {
  let state = {
    profile: { superuser: false, user_id: 'test' },
    router: { location: prev },
  };
  const middleware = analyticsMiddleware({ getState: () => state });
  middleware((dispatched) => {
    state = { ...state, router: { location: next } };
    return dispatched;
  })({ type: LOCATION_CHANGE, payload: { location: next } });
}

describe('analytics page views vs dialogs', () => {
  beforeAll(() => {
    globalThis.gtag = vi.fn();
  });
  beforeEach(() => {
    globalThis.gtag.mockClear();
  });

  it('a pathname change logs one page view with the device id masked', () => {
    runLocationChange(
      { pathname: '/', search: '' },
      { pathname: '/aaaaaaaaaaaaaaaa', search: '' },
    );
    const events = gtagCalls();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'event', name: 'page_view', params: { page_location: '/<dongleId>' } });
  });

  it('a query-only overlay change logs a dialog event, not a second page view', () => {
    runLocationChange(
      { pathname: '/aaaaaaaaaaaaaaaa', search: '' },
      { pathname: '/aaaaaaaaaaaaaaaa', search: '?settings=bbbbbbbbbbbbbbbb' },
    );
    const events = gtagCalls();
    expect(events.filter(({ name }) => name === 'page_view')).toHaveLength(0);
    expect(events[0]).toMatchObject({
      event: 'event',
      name: 'view_dialog',
      params: { dialog: 'settings', page_location: '/<dongleId>' },
    });
  });

  it('the upload overlay is reported by name', () => {
    runLocationChange(
      { pathname: '/aaaaaaaaaaaaaaaa', search: '' },
      { pathname: '/aaaaaaaaaaaaaaaa', search: `?uploads=${'c'.repeat(16)}` },
    );
    expect(gtagCalls()[0].params.dialog).toBe('uploads');
  });
});
