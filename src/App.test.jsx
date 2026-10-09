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
  reconnect: vi.fn(),
  getClipState: vi.fn(async () => ({ clips: [], cameras: {} })),
  hasClipBlob: vi.fn(async () => false),
  getClipUrl: vi.fn(async () => 'blob:clip-preview'),
  deleteClip: vi.fn(async () => ({ success: true })),
  createClip: vi.fn(async () => ({ success: true })),
  deviceSupportsClips: vi.fn(async () => true),
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
vi.mock('./api/clips', () => ({
  deviceSupportsClips: mocks.deviceSupportsClips,
  clipDevice: {
    getClipState: mocks.getClipState,
    hasClipBlob: mocks.hasClipBlob,
    getClipUrl: mocks.getClipUrl,
    deleteClip: mocks.deleteClip,
    createClip: mocks.createClip,
  },
}));
vi.mock('./utils/turn', () => ({ fetchTurnCredentials: vi.fn(async () => null) }));
vi.mock('./utils/webrtc', () => ({
  webrtcConnectionManager: {
    acquire: vi.fn(() => ({ setQuality: vi.fn(), switchCamera: vi.fn() })),
    connection: null,
    disconnect: vi.fn(),
    prewarm: vi.fn(),
    reconnect: mocks.reconnect,
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

function makeClip(filename = 'drive-clip.mp4', status = 'ready') {
  return {
    camera: 'fcamera.hevc',
    filename,
    requested_at: 1,
    route: RECENT_LOG,
    size: 1024,
    source_start_time: 0,
    source_end_time: 10,
    speedup: 1,
    status,
  };
}

function makeOnlineDevices() {
  const ping = Math.floor(Date.now() / 1000);
  return devices.map((device) => ({
    ...device,
    last_athena_ping: ping,
    openpilot_version: '0.11.2',
  }));
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
  if (url.pathname === '/v1/referrals') return json(options.referrals ?? {
    code: 'ABC1234',
    cash: { available: 50, claimed: 50, pending: 50 },
    referrals: [
      { ordered_at: 1_777_000_000, status: 'available' },
      { ordered_at: 1_778_000_000, status: 'pending' },
      { ordered_at: 1_779_000_000, status: 'claimed' },
    ],
  });
  const segments = url.pathname.match(/^\/v1\/devices\/([a-f0-9]{16})\/routes_segments$/);
  if (segments) {
    const dongleId = segments[1];
    if (options.failedRoutes && url.searchParams.has('start')) return json({}, 500);
    if (options.emptyRoutes) return json([]);
    const routeStr = url.searchParams.get('route_str');
    if (routeStr) return json([LOG, RECENT_LOG].some((log) => routeStr.endsWith(`|${log}`)) ? [makeRoute(dongleId, routeStr.split('|')[1])] : []);
    if (options.routeCount) {
      return json(Array.from({ length: options.routeCount }, (_, index) => (
        makeRoute(dongleId, `${RECENT_LOG.slice(0, -2)}${String(index).padStart(2, '0')}`)
      )));
    }
    if (window.location.pathname.includes(`/${START}/`) || url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname.endsWith('/subscription')) return json(options.subscription ?? null);
  if (url.pathname.endsWith('/subscribe_info')) return json(options.subscribeInfo ?? null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/athena_offline_queue')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') {
    const payload = JSON.parse(init.body || '{}');
    return json({ jsonrpc: '2.0', id: 0, result: payload.method === 'listUploadQueue' ? [] : {} });
  }
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
  beforeAll(async () => {
    await Promise.all([
      import('./components/explorer'),
      import('./components/anonymous'),
    ]);
    vi.stubGlobal('fetch', vi.fn(mockFetch));
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: { height: 800 }, configurable: true });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: vi.fn(() => null) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 100, height: 100, left: 0, right: 1000, top: 0, width: 1000, x: 0, y: 0 }),
    });
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.hardNavigate.mockClear();
    mocks.reconnect.mockClear();
    mocks.getClipState.mockReset().mockResolvedValue({ clips: [], cameras: {} });
    mocks.hasClipBlob.mockReset().mockResolvedValue(false);
    mocks.getClipUrl.mockReset().mockResolvedValue('blob:clip-preview');
    mocks.deleteClip.mockReset().mockResolvedValue({ success: true });
    mocks.createClip.mockReset().mockResolvedValue({ success: true });
    mocks.deviceSupportsClips.mockReset().mockResolvedValue(true);
    URL.revokeObjectURL.mockClear();
  });

  test('root uses a valid stored device and keeps the selection', async () => {
    const app = await renderApp('/', { selected: FIRST });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(app.history.location.pathname).toBe(`/${FIRST}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(FIRST);
  });

  test('fetches the initial routes with a nonzero limit', async () => {
    await renderApp('/', { selected: FIRST });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const request = mocks.requests.find(({ url }) => url.includes('routes_segments'));
    expect(new URL(request.url).searchParams.get('limit')).toBe('5');
  });

  test.each([['no stored device', undefined], ['an unknown stored device', 'dddddddddddddddd']])('root selects first device with %s', async (_name, selected) => {
    const { history } = await renderApp('/', { selected });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(FIRST);
  });

  test('root with no devices opens pairing through browser history and can close it', async () => {
    const { history } = await renderApp('/', { devices: [] });
    expect(await screen.findByRole('heading', { name: 'Pair your device' })).toBeVisible();
    expect(history.location.pathname).toBe('/');

    const pairingSection = screen.getByRole('heading', { name: 'Pair your device' }).parentElement;
    fireEvent.click(within(pairingSection).getByRole('button', { name: 'add new device' }));
    await waitFor(() => expect(history.location.search).toBe('?modal=pair'));
    expect(await screen.findByText('Pair device')).toBeVisible();

    act(() => history.goBack());
    await waitFor(() => expect(history.location.search).toBe(''));
    await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Pair your device' })).toBeVisible();

    act(() => history.goForward());
    await waitFor(() => expect(history.location.search).toBe('?modal=pair'));
    expect(await screen.findByText('Pair device')).toBeVisible();
    fireEvent.keyDown(screen.getByText('Pair device'), { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(history.location.search).toBe(''));
    await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Pair your device' })).toBeVisible();
  });

  test('referrals URL opens the referrals page', async () => {
    const { history, store } = await renderApp('/referrals', { selected: SECOND });
    expect(await screen.findByRole('heading', { name: /Refer a friend/ })).toBeVisible();
    expect((await screen.findAllByText('$50', { selector: 'dd' }))).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'claim rewards ($50)' })).toHaveAttribute(
      'href', expect.stringContaining('Referral%20coupon%3A%20ABC1234'),
    );
    expect(mocks.requests).toContainEqual({ method: 'GET', url: 'https://billing.comma.ai/v1/referrals' });
    expect(history.location.pathname).toBe('/referrals');
    expect(store.getState().dongleId).toBe(SECOND);
  });

  test.each([['owned', FIRST], ['shared', SHARED]])('direct entry opens %s device dashboard', async (_name, dongleId) => {
    const { history } = await renderApp(`/${dongleId}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${dongleId}`);
  });

  test('dashboard filter and empty route states remain usable', async () => {
    const { history, store } = await renderApp(`/${FIRST}`, { emptyRoutes: true });
    expect(await screen.findByText('No routes found in selected time range.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(history.location.search).toBe('?modal=filter'));
    const routes = store.getState().routes;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(store.getState().routes).toBe(routes);
    expect(mocks.requests.some(({ url }) => url.includes('routes_segments'))).toBe(true);
  });

  test('modal URLs participate in browser Back and Forward', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await waitFor(() => expect(history.location.search).toBe('?modal=filter'));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    act(() => history.goBack());
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    act(() => history.goForward());
    await waitFor(() => expect(history.location.search).toBe('?modal=filter'));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('pairing can open from its URL without the drawer', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=pair`);
    expect(await screen.findByText('Pair device')).toBeVisible();
    expect(history.location.search).toBe('?modal=pair');
  });

  test('settings remains hidden for a shared device', async () => {
    await renderApp(`/${SHARED}?modal=settings`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
  });

  test('closing a cold drive modal keeps the player and route data mounted', async () => {
    const pathname = `/${FIRST}/${RECENT_LOG}?ci=1&modal=filter`;
    const { history, store } = await renderApp(pathname);
    await waitFor(() => expect(document.querySelector('[aria-label="Drive timeline"]')).not.toBeNull());
    const player = document.querySelector('[data-testid="video-player"]');
    expect(player).not.toBeNull();
    const currentRoute = store.getState().currentRoute;
    const requestCount = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe('?ci=1'));
    expect(document.querySelector('[aria-label="Drive timeline"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="video-player"]')).toBe(player);
    expect(store.getState().currentRoute).toBe(currentRoute);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(requestCount);
  });

  test.each([
    ['files', 'View upload queue'],
    ['info', 'View in useradmin'],
  ])('cold drive %s URL keeps the drive mounted through close and history', async (modal, menuItem) => {
    const pathname = `/${FIRST}/${RECENT_LOG}?ci=1&modal=${modal}`;
    const { history, store } = await renderApp(pathname);
    await waitFor(() => expect(document.querySelector('[aria-label="Drive timeline"]')).not.toBeNull());
    expect(await screen.findByRole('menuitem', { name: menuItem })).toBeVisible();

    const player = document.querySelector('[data-testid="video-player"]');
    const currentRoute = store.getState().currentRoute;
    const routes = store.getState().routes;
    const routeRequestCount = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    fireEvent.keyDown(screen.getByRole('menuitem', { name: menuItem }), { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(history.location.search).toBe('?ci=1'));
    expect(document.querySelector('[data-testid="video-player"]')).toBe(player);
    expect(store.getState().currentRoute).toBe(currentRoute);
    expect(store.getState().routes).toBe(routes);

    act(() => history.goBack());
    await waitFor(() => expect(history.location.search).toBe(`?ci=1&modal=${modal}`));
    expect(await screen.findByRole('menuitem', { name: menuItem })).toBeVisible();
    act(() => history.goForward());
    await waitFor(() => expect(history.location.search).toBe('?ci=1'));
    expect(document.querySelector('[data-testid="video-player"]')).toBe(player);
    expect(store.getState().currentRoute).toBe(currentRoute);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(routeRequestCount);
  });

  test('settings and uploads URLs select their target device', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=settings&device=${SECOND}`);
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(screen.getByText(SECOND)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    await waitFor(() => expect(history.location.search).toBe(`?modal=uploads&device=${SECOND}`));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    expect(screen.getByText(SECOND)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.search).toBe(''));
  });

  test.each([
    ['authenticated whole drive', `/${FIRST}/${LOG}`, true],
    ['authenticated ranged drive', `/${FIRST}/${LOG}/10/20`, true],
    ['public whole drive', `/${FIRST}/${LOG}`, false],
    ['public ranged drive', `/${FIRST}/${LOG}/10/20`, false],
  ])('%s opens from a cold entry', async (_name, pathname, authenticated) => {
    const { history, store } = await renderApp(pathname, { authenticated });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
    const ranged = pathname.endsWith('/10/20');
    expect(store.getState()).toMatchObject({
      selectedRouteId: LOG,
      zoom: { start: ranged ? 10000 : 0, end: ranged ? 20000 : 60000 },
      loop: { startTime: ranged ? 10000 : 0, duration: ranged ? 10000 : 60000 },
    });
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
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(pathname)}`));
  });

  test('a missing authenticated drive resolves to a finite empty state', async () => {
    await renderApp(`/${FIRST}/2026-08-06--99-99-99`, { emptyRoutes: true });
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
  });

  test('auth view follows URL changes away from and back to a public drive', async () => {
    const publicPath = `/${FIRST}/${LOG}`;
    const { history } = await renderApp(publicPath, { authenticated: false });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => history.push(`/${FIRST}`));
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(sessionStorage.getItem('redirectURL')).toBe(`/${FIRST}`);
    act(() => history.push(publicPath));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
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

  test.each([
    ['prime-cancel', 'Cancel prime subscription', 'Close'],
    ['prime-switch', 'Switch to Standard plan', 'Cancel'],
  ])('cold %s URL is history-driven and does not mutate billing', async (modal, heading, closeButton) => {
    const primeDevices = devices.map((device) => ({
      ...device,
      prime: device.dongle_id === FIRST,
    }));
    const pathname = `/${FIRST}/prime?modal=${modal}`;
    const { history } = await renderApp(pathname, {
      devices: primeDevices,
      subscription: {
        amount: 1400,
        next_charge_at: 1_800_000_000,
        plan: 'nodata',
        subscribed_at: 1_700_000_000,
        user_id: 'test-user',
      },
    });
    const findModal = () => Array.from(document.querySelectorAll('[class*="MuiModal-root"]'))
      .find(element => element.textContent.includes(heading));
    await waitFor(() => expect(findModal()).toBeTruthy());
    expect(within(findModal()).getByText(heading)).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/prime`);
    expect(history.location.search).toBe(`?modal=${modal}`);
    expect(mocks.requests.some(({ method, url }) => (
      method !== 'GET' && /\/v1\/prime\/(cancel|switch_plan)/.test(new URL(url).pathname)
    ))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: closeButton }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(findModal()).toBeUndefined();
    act(() => history.goBack());
    await waitFor(() => expect(history.location.search).toBe(`?modal=${modal}`));
    await waitFor(() => expect(findModal()).toBeTruthy());
    expect(within(findModal()).getByText(heading)).toBeVisible();
    act(() => history.goForward());
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(findModal()).toBeUndefined();
    expect(mocks.requests.some(({ method, url }) => (
      method !== 'GET' && /\/v1\/prime\/(cancel|switch_plan)/.test(new URL(url).pathname)
    ))).toBe(false);
  });

  test('switching devices into Prime fetches its subscription once', async () => {
    const primeDevices = devices.map((device) => ({ ...device, prime: device.dongle_id === SECOND }));
    const { history } = await renderApp(`/${FIRST}`, { devices: primeDevices });
    mocks.requests = [];
    act(() => history.push(`/${SECOND}/prime`));

    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}/prime`));
    await waitFor(() => {
      const requests = mocks.requests.filter(({ url }) => {
        const requestUrl = new URL(url);
        return requestUrl.pathname === '/v1/prime/subscription'
          && requestUrl.searchParams.get('dongle_id') === SECOND;
      });
      expect(requests).toHaveLength(1);
    });
  });

  test('stream close and browser history restore its view', async () => {
    const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
    const { history } = await renderApp(`/${FIRST}/stream`, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close teleop' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    act(() => history.goBack());
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    mocks.reconnect.mockClear();
    act(() => history.push(`/${SECOND}/stream`));
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}/stream`));
    await waitFor(() => expect(mocks.reconnect).toHaveBeenCalledWith(SECOND));
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

  test('a cold selected route returns to the full dashboard list', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${RECENT_LOG}`, { routeCount: 10 });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    await waitFor(() => expect(store.getState().routes).toHaveLength(10));
    expect(await screen.findAllByText('Mock recent route start')).toHaveLength(10);
  });

  test('a dashboard-selected route and its list survive URL modal changes', async () => {
    const { history, store } = await renderApp(`/${FIRST}`, { routeCount: 10 });
    expect(await screen.findAllByText('Mock recent route start')).toHaveLength(10);
    const routes = store.getState().routes;
    const driveLink = document.querySelector(`.DriveEntry[href="/${FIRST}/${RECENT_LOG}"]`);
    fireEvent.click(driveLink);
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    const currentRoute = store.getState().currentRoute;
    const requestCount = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    act(() => history.push(`${history.location.pathname}?modal=filter`));
    await waitFor(() => expect(history.location.search).toBe('?modal=filter'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().currentRoute).toBe(currentRoute);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(requestCount);
  });

  test('clip viewer follows browser history and reloads the selected clip', async () => {
    let resolveFirstPreview;
    mocks.getClipState.mockResolvedValue({ clips: [makeClip()], cameras: {} });
    mocks.getClipUrl
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstPreview = resolve; }))
      .mockResolvedValueOnce('blob:clip-preview');
    const { history } = await renderApp(`/${FIRST}?modal=clips`, { devices: makeOnlineDevices() });
    fireEvent.click(await screen.findByRole('button', { name: 'Download clip' }));

    await waitFor(() => expect(history.location.search).toBe('?modal=clip&clip=drive-clip.mp4'));
    await waitFor(() => expect(mocks.getClipUrl).toHaveBeenCalledTimes(1));
    expect(document.querySelector('video')).toBeNull();

    act(() => history.goBack());
    await waitFor(() => expect(history.location.search).toBe('?modal=clips'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close video' })).not.toBeInTheDocument());
    await act(async () => resolveFirstPreview('blob:stale-preview'));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale-preview'));
    expect(document.querySelector('video')).toBeNull();

    act(() => history.goForward());
    await waitFor(() => expect(history.location.search).toBe('?modal=clip&clip=drive-clip.mp4'));
    await waitFor(() => expect(mocks.getClipUrl).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
  });

  test('cold clip viewer keeps its filename while device metadata loads', async () => {
    let resolveClips;
    mocks.getClipState.mockImplementation(() => new Promise((resolve) => { resolveClips = resolve; }));
    const pathname = `/${FIRST}/${RECENT_LOG}?ci=1&modal=clip&clip=drive-clip.mp4`;
    const { history, store } = await renderApp(pathname, { devices: makeOnlineDevices() });
    await waitFor(() => expect(document.querySelector('[aria-label="Drive timeline"]')).not.toBeNull());
    expect(await screen.findByText('Loading clip')).toBeVisible();
    expect(history.location.search).toBe('?ci=1&modal=clip&clip=drive-clip.mp4');
    const player = document.querySelector('[data-testid="video-player"]');
    const currentRoute = store.getState().currentRoute;

    await act(async () => resolveClips({ clips: [makeClip()], cameras: {} }));
    await waitFor(() => expect(mocks.getClipUrl).toHaveBeenCalledWith(FIRST, 'drive-clip.mp4', 1, expect.any(Function)));
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    expect(history.location.search).toBe('?ci=1&modal=clip&clip=drive-clip.mp4');
    expect(within(screen.getByRole('dialog')).getByText('drive-clip')).toBeVisible();
    expect(document.querySelector('[data-testid="video-player"]')).toBe(player);
    expect(store.getState().currentRoute).toBe(currentRoute);
  });

  test('clip selection waits for metadata from the current device before enabling delete', async () => {
    let resolveSecondDeviceClips;
    mocks.getClipState
      .mockResolvedValueOnce({ clips: [makeClip()], cameras: {} })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondDeviceClips = resolve; }));
    const { history } = await renderApp(`/${FIRST}?modal=delete-clip&clip=drive-clip.mp4`, { devices: makeOnlineDevices() });
    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    await waitFor(() => expect(deleteButton).toBeEnabled());

    act(() => history.push(`/${SECOND}?modal=delete-clip&clip=drive-clip.mp4`));
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
    await waitFor(() => expect(mocks.getClipState).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteClip).not.toHaveBeenCalled();

    await act(async () => resolveSecondDeviceClips({ clips: [], cameras: {} }));
    expect(await screen.findByText('This clip is not available.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(history.location.search).toBe('?modal=delete-clip&clip=drive-clip.mp4');
  });

  test('missing cold delete URL remains open without deleting', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=delete-clip&clip=missing.mp4`, { devices: makeOnlineDevices() });
    expect(await screen.findByText('This clip is not available.')).toBeVisible();
    expect(history.location.search).toBe('?modal=delete-clip&clip=missing.mp4');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(mocks.deleteClip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe('?modal=clips'));
    expect(mocks.deleteClip).not.toHaveBeenCalled();
  });

  test('valid cold delete URL only deletes its selected device clip on confirmation', async () => {
    mocks.getClipState.mockResolvedValue({ clips: [makeClip()], cameras: {} });
    const { history } = await renderApp(`/${FIRST}?modal=delete-clip&clip=drive-clip.mp4`, { devices: makeOnlineDevices() });
    expect(await screen.findByText('Delete clip?')).toBeVisible();
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    expect(mocks.deleteClip).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    await waitFor(() => expect(mocks.deleteClip).toHaveBeenCalledTimes(1));
    expect(mocks.deleteClip).toHaveBeenCalledWith(FIRST, { filename: 'drive-clip.mp4' });
    await waitFor(() => expect(history.location.search).toBe('?modal=clips'));
  });

  test('a pending delete leaves a newer device URL in place', async () => {
    let resolveDelete;
    mocks.getClipState.mockResolvedValue({ clips: [makeClip()], cameras: {} });
    mocks.deleteClip.mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));
    const { history } = await renderApp(`/${FIRST}?modal=delete-clip&clip=drive-clip.mp4`, { devices: makeOnlineDevices() });
    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mocks.deleteClip).toHaveBeenCalledTimes(1));

    act(() => history.push(`/${SECOND}?modal=settings`));
    expect(await screen.findByText('Device settings')).toBeVisible();
    await act(async () => resolveDelete({ success: true }));

    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(history.location.search).toBe('?modal=settings');
    expect(screen.getByText('Device settings')).toBeVisible();
    expect(mocks.deleteClip).toHaveBeenCalledWith(FIRST, { filename: 'drive-clip.mp4' });
    expect(mocks.getClipState).toHaveBeenCalledTimes(1);
  });

  test('the first device response stays stale after an A to B to A switch', async () => {
    let resolveFirstDeviceClips;
    mocks.getClipState
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstDeviceClips = resolve; }))
      .mockResolvedValueOnce({ clips: [], cameras: {} })
      .mockResolvedValueOnce({ clips: [], cameras: {} });
    const pathname = `/${FIRST}?modal=delete-clip&clip=drive-clip.mp4`;
    const { history } = await renderApp(pathname, { devices: makeOnlineDevices() });
    await waitFor(() => expect(mocks.getClipState).toHaveBeenCalledTimes(1));

    act(() => history.push(`/${SECOND}?modal=delete-clip&clip=drive-clip.mp4`));
    await waitFor(() => expect(mocks.getClipState).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('This clip is not available.')).toBeVisible();

    act(() => history.push(pathname));
    await waitFor(() => expect(mocks.getClipState).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('This clip is not available.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    await act(async () => resolveFirstDeviceClips({ clips: [makeClip()], cameras: {} }));
    expect(screen.getByText('This clip is not available.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(mocks.deleteClip).not.toHaveBeenCalled();
  });

  test('cold unpair URL can return to settings without unpairing the target device', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=unpair&device=${SECOND}`, { devices: makeOnlineDevices() });
    const unpairTitle = await screen.findByText('Unpair device');
    expect(unpairTitle).toBeVisible();
    expect(within(unpairTitle.parentElement).getByText(SECOND)).toBeVisible();
    expect(mocks.requests.some(({ method, url }) => method !== 'GET' && url.includes('unpair'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(`?modal=settings&device=${SECOND}`));
    expect(screen.getByText('Device settings')).toBeVisible();
    expect(mocks.requests.some(({ method, url }) => method !== 'GET' && url.includes('unpair'))).toBe(false);
  });
});
