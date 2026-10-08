import { LOCATION_CHANGE } from 'connected-react-router';
import { analyticsMiddleware } from './analytics';

vi.mock('@commaai/my-comma-auth', () => ({ default: { isAuthenticated: () => false } }));
vi.mock('./utils', () => ({ deviceIsOnline: () => false }));

const FIRST = '/aaaaaaaaaaaaaaaa';
const SECOND = '/bbbbbbbbbbbbbbbb';
const location = (pathname, search = '', hash = '') => ({ pathname, search, hash });

function trackChange(previous, current) {
  let state = { router: { location: previous } };
  analyticsMiddleware({ getState: () => state })(() => {
    state = { router: { location: current } };
  })({ type: LOCATION_CHANGE, payload: { location: current } });
}

beforeEach(() => vi.stubGlobal('gtag', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

it('retains the first page-view event even when the initial location already matches', () => {
  trackChange(location(FIRST), location(FIRST));
  expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'page_view', { page_location: '/<dongleId>' });
});

it('does not count dialog open/close or hash navigation as a new page', () => {
  trackChange(location(FIRST), location(FIRST, '?modal=settings'));
  trackChange(location(FIRST, '?modal=settings'), location(FIRST));
  trackChange(location(FIRST), location(FIRST, '', '#drives'));
  expect(gtag).not.toHaveBeenCalled();
});

it('counts a different device page while keeping device identifiers private', () => {
  trackChange(location(FIRST), location(SECOND));
  expect(gtag).toHaveBeenCalledExactlyOnceWith('event', 'page_view', { page_location: '/<dongleId>' });
});
