import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { storage as AuthStorage } from '@commaai/my-comma-auth';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { seek } from './timeline/playback';
import { DEMO_DONGLE_ID, PUBLIC_ROUTE_LOG_ID } from './api/demo';

vi.setConfig({ testTimeout: 15000 });

const mocks = vi.hoisted(() => ({ authenticated: true, options: {}, requests: [], hardNavigate: vi.fn() }));

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
  if (url.pathname === '/v2/auth/' && init.method === 'POST') return json({ access_token: 'exchanged-token' });
  if (url.pathname === '/v1/me/turn') return json(null);
  if (url.pathname === '/v1/me/') return json({ id: 'test-user', superuser: false });
  if (url.pathname === '/v1/me/devices/') return json(await deviceList);
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
    if (routeStr) return json([LOG, RECENT_LOG, PUBLIC_ROUTE_LOG_ID].some((log) => routeStr.endsWith(`|${log}`)) ? [makeRoute(dongleId, routeStr.split('|')[1])] : []);
    if (url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
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
  const initialEntries = options.initialEntries || [pathname];
  const history = createMemoryHistory({ initialEntries, initialIndex: initialEntries.length - 1 });
  const store = createAppStore(history, createInitialState(history.location.pathname));
  const view = render(<App history={history} store={store} />);
  await options.beforeStartup?.(store);
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
  });

  test('auth callback preserves the stored return drive URL', async () => {
    sessionStorage.setItem('redirectURL', `/${FIRST}/${LOG}`);
    const { history } = await renderApp('/auth/?code=x&provider=google');
    expect(AuthStorage.setCommaAccessToken).toHaveBeenCalledWith('exchanged-token');
    expect(mocks.requests).toContainEqual({ method: 'POST', url: 'https://api.comma.ai/v2/auth/' });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
  });

  test('root uses a valid stored device and keeps the selection', async () => {
    const app = await renderApp('/', { selected: FIRST });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(app.history.location.pathname).toBe(`/${FIRST}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(FIRST);
  });

  test('cold dashboard hydrates once and same-device zooms do not hydrate again', async () => {
    let resolveDevices;
    const deviceList = new Promise((resolve) => { resolveDevices = resolve; });
    const observed = [];
    const { history } = await renderApp(`/${FIRST}`, { devices: deviceList, beforeStartup: async (pendingStore) => {
      pendingStore.subscribe(() => observed.push(pendingStore.getState()));
      await waitFor(() => expect(pendingStore.getState().routes).not.toBeNull());
      expect(screen.getByRole('status', { name: 'Loading' })).toBeVisible();
      expect(screen.queryByText('Mock recent route start')).not.toBeInTheDocument();
      expect(pendingStore.getState().device).toBeNull();
      resolveDevices(devices);
    } });
    const loaded = observed.find((state) => state.devices);
    expect(loaded.device).toBe(loaded.devices.find((d) => d.dongle_id === FIRST));
    expect(observed.every(({ device }) => !device || device.is_owner)).toBe(true);
    const deviceUrl = `https://api.comma.ai/v1.1/devices/${FIRST}/`;
    const subscriptionUrl = `https://billing.comma.ai/v1/prime/subscribe_info?dongle_id=${FIRST}`;
    const hydrationRequests = () => mocks.requests.map(({ url }) => url).filter((url) => url === deviceUrl || url === subscriptionUrl);
    expect(hydrationRequests()).toHaveLength(2);
    expect(hydrationRequests()).toEqual(expect.arrayContaining([deviceUrl, subscriptionUrl]));
    act(() => history.push(`/${FIRST}/${RECENT_LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => history.push(`/${FIRST}/${RECENT_LOG}/10/20`));
    act(() => history.push(`/${FIRST}/${RECENT_LOG}/12/18`));
    expect(hydrationRequests()).toHaveLength(2);
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
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(SECOND);
  });

  test('root with no devices shows pairing', async () => {
    const { history } = await renderApp('/', { devices: [] });
    expect(await screen.findByRole('heading', { name: 'Pair your device' })).toBeVisible();
    expect(history.location.pathname).toBe('/');
  });

  test('referrals URL opens the referrals page', async () => {
    await renderApp('/referrals');
    expect(await screen.findByRole('heading', { name: /Refer a friend/ })).toBeVisible();
    expect((await screen.findAllByText('$50', { selector: 'dd' }))).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'claim rewards ($50)' })).toHaveAttribute(
      'href', expect.stringContaining('Referral%20coupon%3A%20ABC1234'),
    );
    expect(mocks.requests).toContainEqual({ method: 'GET', url: 'https://billing.comma.ai/v1/referrals' });
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
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${pathname}`));
  });

  test('legacy timestamp URL converts after a successful lookup', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
  });

  test.each([['empty', { emptyRoutes: true }], ['failed', { failedRoutes: true }]])('legacy timestamp URL stays after an %s lookup', async (_name, options) => {
    const pathname = `/${FIRST}/${START}/${START + 60_000}`;
    const { history } = await renderApp(pathname, options);
    expect(history.location.pathname).toBe(pathname);
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

  test('browser navigation to another drive resets playback and its loop', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => store.dispatch(seek(25000)));
    const route = store.getState().currentRoute;
    act(() => history.replace(`/${FIRST}/${LOG}`));
    expect(store.getState().currentRoute).toBe(route);
    expect(store.getState().offset).toBe(25000);
    act(() => history.push(`/${FIRST}/${RECENT_LOG}`));
    await waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(RECENT_LOG));
    expect(store.getState().offset).toBe(0);
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 60000 });
  });

  test('closing a drive opened by URL shows the full drive list', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(store.getState().selectedRouteId).toBeNull();
  });

  test('opening an uncached drive on the same device fetches it and retains the drive list', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const recent = store.getState().routes[0];
    act(() => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(store.getState().routes).toContain(recent);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test('two zooms then browser back restores the previous zoom without a stack', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    const timeline = await screen.findByRole('slider', { name: 'Drive timeline' });
    const zoom = (left, right) => {
      fireEvent.pointerDown(timeline, { button: 0, clientX: left, pageX: left });
      fireEvent.pointerMove(document, { clientX: right, pageX: right });
      fireEvent.pointerUp(document, { button: 0, clientX: right, pageX: right });
    };
    zoom(100, 900);
    const firstPath = history.location.pathname;
    const firstZoom = store.getState().zoom;
    zoom(300, 600);
    expect(history.location.pathname).not.toBe(firstPath);
    act(() => history.goBack());
    expect(history.location.pathname).toBe(firstPath);
    expect(store.getState().zoom).toEqual(firstZoom);
    expect(store.getState().zoom).not.toHaveProperty('previous');
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeDisabled();
  });

  test('legacy conversion replaces its history entry so back returns to the prior page', async () => {
    const pathname = `/${FIRST}/${START}/${START + 60_000}`;
    const { history } = await renderApp(pathname, { initialEntries: [`/${SECOND}`, pathname] });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(history.length).toBe(2);
    act(() => history.goBack());
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test('settings URL opens at 600px with the drawer closed, and closes to its device', async () => {
    const width = window.innerWidth;
    window.innerWidth = 600;
    try {
      const { history } = await renderApp(`/${FIRST}/settings`);
      expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
      expect(screen.queryByRole('link', { name: 'device settings' })).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Device name' })).toHaveValue('Zulu');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(history.location.pathname).toBe(`/${FIRST}`);
      expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    } finally {
      window.innerWidth = width;
    }
  });

  test('settings navigates to Prime for its URL device rather than the remembered device', async () => {
    const { history, store } = await renderApp(`/${SECOND}/settings`, { selected: FIRST });
    fireEvent.click(await screen.findByRole('button', { name: 'Prime settings' }));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${SECOND}/prime`);
    expect(store.getState().dongleId).toBe(SECOND);
  });

  test('shared settings URL shows the dashboard without settings controls', async () => {
    await renderApp(`/${SHARED}/settings`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
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

  test('demo entry lands on the demo device dashboard', async () => {
    // The backend is selected once per application startup, so start a fresh app.
    vi.resetModules();
    const { default: DemoApp } = await import('./App');
    const { createAppStore: createDemoStore } = await import('./store');
    mocks.authenticated = false;
    mocks.options = {};
    window.history.replaceState({}, '', '/demo');
    const history = createMemoryHistory({ initialEntries: ['/demo'] });
    const store = createDemoStore(history, createInitialState());
    render(<DemoApp history={history} store={store} />);
    expect(await screen.findByRole('button', { name: 'Filter' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${DEMO_DONGLE_ID}`));
    expect(store.getState().device.alias).toBe('demo device');
  });
});
