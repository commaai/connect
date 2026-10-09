import { vi } from 'vitest';
import { LOCATION_CHANGE } from 'connected-react-router';

// evaluate the store before analytics: analytics.js -> utils -> timeline -> store
// is a module cycle that only resolves cleanly when store.js runs first
import './store';
import { analyticsMiddleware } from './analytics';

vi.mock('@commaai/my-comma-auth', () => ({
  default: { isAuthenticated: vi.fn(() => false), init: vi.fn() },
}));

const DONGLE = '0000aaaa0000aaaa';
const LOG = '2026-08-06--12-00-00';
const gtag = vi.fn();

function run(action, state) {
  const next = vi.fn();
  analyticsMiddleware({ getState: () => state })(next)(action);
}

describe('analytics middleware', () => {
  beforeAll(() => {
    vi.stubGlobal('gtag', gtag);
  });

  afterEach(() => {
    gtag.mockClear();
  });

  it('templates a page_view from the parsed location', () => {
    run(
      { type: LOCATION_CHANGE, payload: { location: { pathname: `/${DONGLE}/${LOG}/10/20`, search: '' } } },
      { profile: { user_id: 'u' }, router: { location: { pathname: `/${DONGLE}`, search: '' } } },
    );
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', { page_location: `/<dongleId>/${LOG}/10/20` });
  });

  it('records kind demo as /demo', () => {
    run(
      { type: LOCATION_CHANGE, payload: { location: { pathname: '/demo', search: '' } } },
      { profile: { user_id: 'u' }, router: { location: { pathname: '/demo', search: '' } } },
    );
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', { page_location: '/demo' });
  });

  it('never sends the search string', () => {
    run(
      { type: LOCATION_CHANGE, payload: { location: { pathname: `/${DONGLE}/prime`, search: '?stripe_success=cs_test&pair=jwt' } } },
      { profile: { user_id: 'u' }, router: { location: { pathname: `/${DONGLE}/prime`, search: '' } } },
    );
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', { page_location: '/<dongleId>/prime' });
  });

  it('marks traffic as ci from the location passthrough', () => {
    run(
      { type: 'ACTION_SELECT_DEVICE' },
      {
        profile: { user_id: 'u' },
        device: null,
        router: { location: { pathname: `/${DONGLE}`, search: '?ci=1' } },
      },
    );
    expect(gtag).toHaveBeenCalledWith('event', 'select_device', expect.objectContaining({ traffic_type: 'ci' }));
  });
});
