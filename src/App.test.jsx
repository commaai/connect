import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  options: {},
  requests: [],
  hardNavigate: vi.fn(),
  copy: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@commaai/my-comma-auth', () => ({
  default: {
    init: vi.fn(async () => mocks.authenticated ? 'test-token' : null),
    isAuthenticated: vi.fn(() => mocks.authenticated),
    logOut: vi.fn(),
  },
  config: { AUTH_PATH: '/auth/' },
  storage: { setCommaAccessToken: vi.fn() },
}));
vi.mock('./utils/navigation', () => ({ hardNavigate: mocks.hardNavigate }));
vi.mock('./utils/turn', () => ({ fetchTurnCredentials: vi.fn(async () => null) }));
vi.mock('./utils/webrtc', () => ({
  webrtcConnectionManager: {
    acquire: vi.fn(() => ({ setQuality: vi.fn(), switchCamera: vi.fn() })),
    connection: null,
    disconnect: vi.fn(),
    prewarm: vi.fn(),
    reconnect: vi.fn(),
    release: vi.fn(),
  },
}));
vi.mock('react-map-gl', () => ({
  default: React.forwardRef((_props, ref) => <div ref={ref} data-testid="map" />),
  GeolocateControl: () => null,
  HTMLOverlay: () => null,
  Layer: () => null,
  LinearInterpolator: class {},
  Marker: ({ children }) => children,
  Source: ({ children }) => children,
  WebMercatorViewport: class {},
}));
vi.mock('react-player/file', () => ({
  default: React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({
      getCurrentTime: () => 0,
      getDuration: () => 60,
      getInternalPlayer: () => ({
        buffered: { end: () => 60, length: 1, start: () => 0 },
        pause: vi.fn(), paused: true, play: vi.fn(async () => undefined), playbackRate: 1, readyState: 4,
      }),
      seekTo: vi.fn(),
    }));
    return <div data-testid="video-player" />;
  }),
}));
vi.mock('barcode-detector/ponyfill', () => ({ BarcodeDetector: class { detect() { return []; } } }));

const FIRST = 'aaaaaaaaaaaaaaaa';
const SECOND = 'bbbbbbbbbbbbbbbb';
const SHARED = 'cccccccccccccccc';
const LOG = '2026-08-06--12-00-00';
const RECENT_LOG = '2026-08-06--13-00-00';
const START = Date.UTC(2026, 7, 6, 12);

const devices = [
  { alias: 'Zulu', dongle_id: FIRST, device_type: 'threex', is_owner: true, prime: false },
  { alias: 'Alpha', dongle_id: SECOND, device_type: 'threex', is_owner: true, prime: false },
];

function makeRoute(dongleId, logId = RECENT_LOG) {
  const start = logId === LOG ? START : START + 3_600_000;
  return {
    create_time: start, distance: 1, dongle_id: dongleId, end_time_utc_millis: start + 60_000,
    events: [], fullname: `${dongleId}|${logId}`, maxqlog: 0,
    segment_end_times: [start + 60_000], segment_numbers: [0], segment_start_times: [start],
    startLocation: { place: logId === LOG ? 'Mock route start' : 'Mock recent route start', details: 'Start details' },
    endLocation: { place: 'Mock route end', details: 'End details' }, start_time_utc_millis: start,
    url: 'https://routes.example.com',
  };
}

function json(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

async function mockFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  mocks.requests.push({ method: init.method || 'GET', url: url.href });
  const options = mocks.options;
  const deviceList = options.devices ?? devices;
  if (url.pathname === '/v1/me/turn') return json(null);
  if (url.pathname === '/v1/me/') return json({ id: 'test-user', superuser: false });
  if (url.pathname === '/v1/me/devices/') return json(deviceList);
  const segments = url.pathname.match(/^\/v1\/devices\/([a-f0-9]{16})\/routes_segments$/);
  if (segments) {
    const dongleId = segments[1];
    if (options.failedRoutes && url.searchParams.has('start')) return json({}, 500);
    if (options.emptyRoutes) return json([]);
    const routeStr = url.searchParams.get('route_str');
    if (routeStr) return json([LOG, RECENT_LOG].some((log) => routeStr.endsWith(`|${log}`)) ? [makeRoute(dongleId, routeStr.split('|')[1])] : []);
    if (window.location.pathname.includes(`/${START}/`) || url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname === '/v1/referrals') {
    if (options.forbiddenReferrals) return json({}, 403);
    if (options.failedReferrals) return json({}, 500);
    return json({
      code: 'COMMA-TEST',
      cash: options.cash ?? { pending: 0, available: 0, claimed: 0 },
      referrals: options.referrals ?? [],
    });
  }
  if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') return json({ jsonrpc: '2.0', id: 0, result: {} });
  throw new Error(`Unhandled request: ${init.method || 'GET'} ${url.href}`);
}

async function renderApp(pathname, options = {}) {
  mocks.authenticated = options.authenticated !== false;
  mocks.options = options;
  mocks.requests = [];
  window.history.replaceState({}, '', pathname);
  if (options.selected) localStorage.setItem('selectedDongleId', options.selected);
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(history.location.pathname));
  const view = render(<App history={history} store={store} />);
  await waitFor(
    () => expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument(),
    { timeout: 5000 },
  );
  // Explorer initialization starts several independent async updates (device
  // details, stats, routes, and clip support). Let their promise chains finish
  // while React is inside act before handing control back to each test.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { ...view, history, store };
}

describe('whole-app behavior', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(mockFetch));
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: { height: 800 }, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: mocks.copy }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: mocks.share, configurable: true });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: vi.fn(() => null) });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 100, height: 100, left: 0, right: 1000, top: 0, width: 1000, x: 0, y: 0 }),
    });
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.hardNavigate.mockClear();
    mocks.copy.mockClear();
    mocks.share.mockClear();
  });

  test('root uses a valid stored device and keeps the selection', async () => {
    const app = await renderApp('/', { selected: FIRST });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(app.history.location.pathname).toBe(`/${FIRST}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(FIRST);
  });

  test.each([['no stored device', undefined], ['an unknown stored device', 'dddddddddddddddd']])('root selects first device with %s', async (_name, selected) => {
    const { history } = await renderApp('/', { selected });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(FIRST);
  });

  test('root with no devices shows pairing', async () => {
    const { history } = await renderApp('/', { devices: [] });
    expect(await screen.findByRole('heading', { name: 'Pair your device' })).toBeVisible();
    expect(history.location.pathname).toBe('/');
  });

  test('dismissed promotions stay hidden after the dashboard remounts', async () => {
    const app = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Give $50, Get $50')).toBeVisible();

    fireEvent.click(screen.getByLabelText('Dismiss referral promotion'));
    expect(screen.queryByText('Give $50, Get $50')).not.toBeInTheDocument();

    app.unmount();
    await renderApp(`/${FIRST}`);
    expect(screen.queryByText('Give $50, Get $50')).not.toBeInTheDocument();
    expect(screen.getByText('comma prime')).toBeVisible();
  });

  test('scrolls to the top when navigating to referrals', async () => {
    await renderApp(`/${FIRST}`);
    const referralButton = await screen.findByRole('button', { name: 'referrals' });
    window.scrollTo.mockClear();

    fireEvent.click(referralButton);

    expect(await screen.findByRole('heading', { name: 'Refer a friend, Get $50.' })).toBeVisible();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  test('referrals route is retained while devices initialize', async () => {
    const referrals = [{
      ordered_at: 1767225600, status: 'pending',
    }];
    const { history } = await renderApp('/referrals', {
      referrals,
      cash: { pending: 50, available: 0, claimed: 0 },
    });
    expect(await screen.findByRole('heading', { name: 'Refer a friend, Get $50.' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'They save $50' })).toBeVisible();
    expect(screen.getByText('Your link takes $50 off their comma four order.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'You earn $50 cash' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Refer a friend' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://refer.comma.ai/COMMA-TEST')).not.toBeInTheDocument();
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Order #1001')).not.toBeInTheDocument();
    expect(screen.getByText('Pending rewards:').nextSibling).toHaveTextContent('$50');
    expect(mocks.requests.some(({ url }) => url.endsWith('/v1/prime/subscription') || url.includes('/v1/prime/subscribe_info'))).toBe(false);
    expect(history.location.pathname).toBe('/referrals');
  });

  test('referral link opens in the native share sheet', async () => {
    await renderApp('/referrals');
    const referralUrl = 'https://refer.comma.ai/COMMA-TEST';

    expect(screen.getByText(referralUrl)).toBeVisible();
    expect(screen.queryByRole('link', { name: referralUrl })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'share your link' }));
    await waitFor(() => expect(mocks.share).toHaveBeenCalledWith({
      title: 'Give $50, Get $50 with comma',
      text: 'Get $50 off your comma four purchase using my referral link.',
      url: referralUrl,
    }));
    const sharedButton = screen.getByRole('button', { name: 'shared' });
    expect(sharedButton).toBeVisible();
    expect(sharedButton.firstChild).not.toHaveClass('animate-pulse');
  });

  test('referral link can be copied directly', async () => {
    await renderApp('/referrals');

    fireEvent.click(screen.getByRole('button', { name: 'Copy referral link' }));

    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('https://refer.comma.ai/COMMA-TEST'));
    const copiedButton = screen.getByRole('button', { name: 'copied' });
    expect(copiedButton).toBeVisible();
    expect(copiedButton.firstChild).not.toHaveClass('animate-pulse');

    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('button', { name: 'copied' })).toBeVisible();
    vi.useRealTimers();
  });

  test('referral link is copied when native sharing fails', async () => {
    mocks.share.mockRejectedValueOnce(new Error('Web Share unavailable'));
    await renderApp('/referrals');

    fireEvent.click(screen.getByRole('button', { name: 'share your link' }));

    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('https://refer.comma.ai/COMMA-TEST'));
    expect(screen.getByRole('button', { name: 'copied' })).toBeVisible();
  });

  test('referral terms can be opened and closed from below the referral link', async () => {
    await renderApp('/referrals');

    expect(screen.getByText(/Referrals are limited to 10 usages/)).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'terms' }));

    expect(screen.getByRole('dialog', { name: 'Referral terms and conditions' })).toBeVisible();
    expect(screen.getByText(/A referral qualifies when a new customer/)).toBeVisible();
    expect(screen.getByText(/Rewards become available to claim 30 days after the order is placed/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('referral receipt totals rewards by status', async () => {
    const referrals = [
      {
        ordered_at: 1767225600, status: 'pending',
      },
      {
        ordered_at: 1772323200, status: 'claim',
      },
      {
        ordered_at: 1769904000, status: 'pending',
      },
      {
        ordered_at: 1775001600, status: 'returned',
      },
      {
        ordered_at: 1764547200, status: 'cancelled',
      },
      {
        ordered_at: 1777593600, status: 'claimed',
      },
    ];
    await renderApp('/referrals', {
      referrals,
      cash: { pending: 100, available: 50, claimed: 50 },
    });

    const claimAction = screen.getByRole('link', { name: 'claim rewards ($50)' });
    const referralsHeading = screen.getByRole('heading', { name: 'Your Referrals Summary' });
    expect(referralsHeading.compareDocumentPosition(claimAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Available to claim:').nextSibling).toHaveTextContent('$50');
    expect(screen.getByText('Available to claim:').nextSibling).toHaveClass('text-green-300');
    expect(screen.getByText('Pending rewards:').nextSibling).toHaveTextContent('$100');
    expect(screen.getByText('Already claimed:').nextSibling).toHaveTextContent('$50');
    expect(screen.getByText('Already claimed:').nextSibling).not.toHaveClass('text-green-300');
    expect(decodeURIComponent(claimAction.getAttribute('href'))).toContain('for 1 referral.');

    fireEvent.click(claimAction);
    expect(screen.getByRole('link', { name: 'Opening mail app…' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('referral receipt shows zero totals when there are no referrals', async () => {
    await renderApp('/referrals', { referrals: [] });
    expect(screen.getByText('Available to claim:').nextSibling).toHaveTextContent('$0');
    expect(screen.getByText('Available to claim:').nextSibling).not.toHaveClass('text-green-300');
    expect(screen.getByText('Pending rewards:').nextSibling).toHaveTextContent('$0');
    expect(screen.getByText('Already claimed:').nextSibling).toHaveTextContent('$0');
    expect(screen.getByRole('button', { name: 'claim rewards ($0)' })).toBeDisabled();
  });

  test('account menu opens referrals without a page reload', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(screen.getByRole('button', { name: 'account menu' }));
    fireEvent.click(screen.getByRole('link', { name: 'Referrals' }));
    expect(await screen.findByRole('heading', { name: 'Refer a friend, Get $50.' })).toBeVisible();
    expect(history.location.pathname).toBe('/referrals');
  });

  test('gift icon opens referrals without a page reload', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(screen.getByTitle('gift')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'referrals' }));
    expect(await screen.findByRole('heading', { name: 'Refer a friend, Get $50.' })).toBeVisible();
    expect(history.location.pathname).toBe('/referrals');
    expect(screen.getByTitle('gift-open').closest('svg')).toHaveStyle({ color: '#fff' });

    fireEvent.click(screen.getByRole('button', { name: 'referrals' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(screen.getByTitle('gift')).toBeInTheDocument();
    expect(screen.queryByTitle('gift-open')).not.toBeInTheDocument();
  });

  test('connect header returns to the selected device from referrals', async () => {
    const { history } = await renderApp('/referrals', { selected: FIRST });
    fireEvent.click(await screen.findByRole('link', { name: 'connect' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
  });

  test('failed referrals request replaces the loader with an error', async () => {
    await renderApp('/referrals', { failedReferrals: true });
    expect(await screen.findByText('Could not load your referral program. Please try again.')).toBeVisible();
    expect(screen.queryByText('Loading referrals…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('forbidden referrals request explains comma 4 ownership requirement', async () => {
    await renderApp('/referrals', { forbiddenReferrals: true });
    expect(await screen.findByText('Referrals are only available for comma four owners')).toBeVisible();
    expect(screen.queryByText('Could not load your referral program. Please try again.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  test('failed referrals request can be retried', async () => {
    await renderApp('/referrals', { failedReferrals: true });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    mocks.options.failedReferrals = false;
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Your Referrals Summary' })).toBeVisible();
    expect(mocks.requests.filter(({ url }) => url.endsWith('/v1/referrals'))).toHaveLength(2);
  });

  test.each([['owned', FIRST], ['shared', SHARED]])('direct entry opens %s device dashboard', async (_name, dongleId) => {
    const { history } = await renderApp(`/${dongleId}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${dongleId}`);
  });

  test('dashboard filter and empty route states remain usable', async () => {
    await renderApp(`/${FIRST}`, { emptyRoutes: true });
    expect(await screen.findByText('No routes found in selected time range.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.requests.some(({ url }) => url.includes('routes_segments'))).toBe(true);
  });

  test.each([
    ['authenticated whole drive', `/${FIRST}/${LOG}`, true],
    ['authenticated ranged drive', `/${FIRST}/${LOG}/10/20`, true],
    ['public whole drive', `/${FIRST}/${LOG}`, false],
    ['public ranged drive', `/${FIRST}/${LOG}/10/20`, false],
  ])('%s opens from a cold entry', async (_name, pathname, authenticated) => {
    const { history } = await renderApp(pathname, { authenticated });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
  });

  test.each([
    ['private device', `/${FIRST}`], ['Prime', `/${FIRST}/prime`], ['stream', `/${FIRST}/stream`],
  ])('signed-out %s entry retains its path', async (_name, pathname) => {
    const { history } = await renderApp(pathname, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
  });

  test('a missing public route redirects to login with the requested route', async () => {
    const pathname = `/${FIRST}/2026-08-06--99-99-99`;
    await renderApp(pathname, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${pathname}`));
  });

  test('legacy timestamp URL converts after a successful lookup', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
  });

  test.each([['empty', { emptyRoutes: true }], ['failed', { failedRoutes: true }]])('legacy timestamp remains after an %s lookup', async (_name, options) => {
    const pathname = `/${FIRST}/${START}/${START + 60_000}`;
    const { history } = await renderApp(pathname, options);
    await waitFor(() => expect(history.location.pathname).toBe(pathname));
  });

  test('Prime close and browser history restore its view', async () => {
    const { history } = await renderApp(`/${FIRST}/prime`);
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    act(() => history.goBack());
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
  });

  test('stream close and browser history restore its view', async () => {
    const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
    const { history } = await renderApp(`/${FIRST}/stream`, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close teleop' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    act(() => history.goBack());
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
  });

  test('device browser history restores exact dashboards', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${SECOND}`));
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    act(() => history.goForward());
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
  });

  test('drive selection, timeline range, back, and close preserve exact URLs', async () => {
    const { history } = await renderApp(`/${FIRST}`, { selected: FIRST });
    fireEvent.click(await screen.findByText('Mock recent route start'));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    const timeline = await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.pointerDown(timeline, { button: 0, clientX: 200, pageX: 200 });
    fireEvent.pointerMove(document, { clientX: 700, pageX: 700 });
    fireEvent.pointerUp(document, { button: 0, clientX: 700, pageX: 700 });
    await waitFor(() => expect(history.location.pathname).toMatch(new RegExp(`/${FIRST}/${RECENT_LOG}/\\d+/\\d+$`)));
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
  });
});
