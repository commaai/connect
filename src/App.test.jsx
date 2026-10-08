import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { pause, seek } from './timeline/playback';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  options: {},
  requests: [],
  hardNavigate: vi.fn(),
  enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]),
  getUserMedia: vi.fn(async () => { throw new Error('Camera access requires an explicit action'); }),
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
vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    createInstance: vi.fn(() => ({
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
    })),
  },
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
  const place = dongleId === SECOND ? 'Second device recent route start' : 'Mock recent route start';
  return {
    create_time: start, distance: 1, dongle_id: dongleId, end_time_utc_millis: start + 60_000,
    events: [], fullname: `${dongleId}|${logId}`, maxqlog: 0,
    segment_end_times: [start + 60_000], segment_numbers: [0], segment_start_times: [start],
    startLocation: { place: logId === LOG ? 'Mock route start' : place, details: 'Start details' },
    endLocation: { place: 'Mock route end', details: 'End details' }, start_time_utc_millis: start,
    url: 'https://routes.example.com',
  };
}

function json(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

async function mockFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  mocks.requests.push({ method: init.method || 'GET', url: url.href });
  const options = mocks.options;
  const deviceList = options.devices ?? devices;
  if (url.pathname === '/v2/auth/') return json({ access_token: 'test-token' });
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
    if (routeStr && options.routeErrorStatus) return json({}, options.routeErrorStatus);
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
  if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.pathname.endsWith('/athena_offline_queue')) return json([]);
  if (url.hostname === 'athena.comma.ai') {
    const payload = JSON.parse(init.body || '{}');
    const result = {
      listUploadQueue: [],
      getVersion: options.clipsSupported ? { commit_date: 1_775_000_000 } : {},
      getClipState: { clips: [], cameras: {} },
    }[payload.method] ?? {};
    return json({ jsonrpc: '2.0', id: payload.id ?? 0, result });
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
  const store = createAppStore(history, createInitialState(history.location));
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

function routeRequests() {
  return mocks.requests.filter(({ url }) => new URL(url).pathname.endsWith('/routes_segments'));
}

function driveState(store) {
  const { dongleId, selectedRouteId, device, routes, currentRoute, filter, zoom, loop, offset, desiredPlaySpeed } = store.getState();
  return { dongleId, selectedRouteId, device, routes, currentRoute, filter, zoom, loop, offset, desiredPlaySpeed };
}

describe('whole-app behavior', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(mockFetch));
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: { height: 800 }, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: mocks.enumerateDevices, getUserMedia: mocks.getUserMedia },
    });
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
    mocks.enumerateDevices.mockClear();
    mocks.getUserMedia.mockClear();
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
    const { history } = await renderApp(`/${FIRST}`, { emptyRoutes: true });
    expect(await screen.findByText('No routes found in selected time range.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(new URLSearchParams(history.location.search).get('dialog')).toBe('time-filter');
    expect(history.action).toBe('PUSH');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Start date:')).not.toBeInTheDocument());
    expect(history.location.search).toBe('');
    expect(history.action).toBe('REPLACE');
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

  test('signed-out navigation gates a protected dashboard and Back restores the public drive', async () => {
    const publicDrive = `/${FIRST}/${LOG}/10/20`;
    const { history, store } = await renderApp(publicDrive, { authenticated: false });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();

    act(() => history.push(`/${SECOND}`));
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ dongleId: SECOND, selectedRouteId: null, currentRoute: null });
    expect(history.location.pathname).toBe(`/${SECOND}`);

    act(() => history.goBack());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({
      dongleId: FIRST,
      selectedRouteId: LOG,
      currentRoute: { fullname: `${FIRST}|${LOG}` },
      zoom: { start: 10000, end: 20000 },
      loop: { startTime: 10000, duration: 10000 },
    });
    expect(history.location.pathname).toBe(publicDrive);
  });

  test('a signed-out settings deep link restores its background, target, and hash after authentication', async () => {
    const destination = `/${FIRST}?dialog=settings&dialogDevice=${SECOND}&source=shared#devices`;
    const landing = await renderApp(destination, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('redirectURL')).toBe(destination);
    landing.unmount();

    const { history, store } = await renderApp('/auth/?code=test-code&provider=g');
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    expect(screen.getAllByText('Device settings')).toHaveLength(1);
    expect(`${history.location.pathname}${history.location.search}${history.location.hash}`).toBe(destination);
    expect(store.getState()).toMatchObject({ dongleId: FIRST, device: { dongle_id: FIRST }, selectedRouteId: null });
    expect(sessionStorage.getItem('redirectURL')).toBeNull();
    expect(mocks.requests).toContainEqual({ method: 'POST', url: 'https://api.comma.ai/v2/auth/' });
  });

  test('a missing public route redirects to login with the requested route', async () => {
    const destination = `/${FIRST}/2026-08-06--99-99-99?dialog=route-info&source=shared#segment`;
    await renderApp(destination, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalled());
    const redirect = new URL(mocks.hardNavigate.mock.calls[0][0], window.location.origin);
    expect(redirect.pathname).toBe('/');
    expect(redirect.searchParams.get('r')).toBe(destination);
  });

  test('a missing authenticated drive shows a terminal state for the requested drive', async () => {
    const path = `/${FIRST}/${LOG}`;
    const { history, store } = await renderApp(path, { emptyRoutes: true });
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ dongleId: FIRST, selectedRouteId: LOG, currentRoute: null });
    expect(history.location.pathname).toBe(path);
    expect(mocks.hardNavigate).not.toHaveBeenCalled();
  });

  test.each([403, 500])('a drive request returning %s can retry the same requested drive', async (status) => {
    const path = `/${FIRST}/${LOG}/0/20`;
    const { history, store } = await renderApp(path, { routeErrorStatus: status });
    expect(await screen.findByText('Unable to load route.')).toBeVisible();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    const failedRequestCount = routeRequests().length;
    mocks.options.routeErrorStatus = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState()).toMatchObject({
      selectedRouteId: LOG,
      currentRoute: { fullname: `${FIRST}|${LOG}` },
      zoom: { start: 0, end: 20000 },
    });
    expect(routeRequests()).toHaveLength(failedRequestCount + 1);
    expect(routeRequests().every(({ url }) => new URL(url).searchParams.get('route_str') === `${FIRST}|${LOG}`)).toBe(true);
    expect(history.location.pathname).toBe(path);
  });

  test('a range outside the drive can recover to the same whole drive without refetching', async () => {
    const path = `/${FIRST}/${LOG}/10/90`;
    const { history, store } = await renderApp(path);
    expect(await screen.findByText('This time range is outside the drive.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({
      dongleId: FIRST,
      selectedRouteId: LOG,
      currentRoute: null,
      routeLoad: { status: 'invalid' },
    });
    expect(history.location.pathname).toBe(path);
    const requestCount = routeRequests().length;

    fireEvent.click(screen.getByRole('button', { name: 'Back to drive' }));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(screen.queryByText('This time range is outside the drive.')).not.toBeInTheDocument();
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(store.getState()).toMatchObject({
      dongleId: FIRST,
      selectedRouteId: LOG,
      currentRoute: { fullname: `${FIRST}|${LOG}` },
      routeLoad: { status: 'ready' },
      zoom: { start: 0, end: 60000 },
      loop: { startTime: 0, duration: 60000 },
    });
    expect(routeRequests()).toHaveLength(requestCount);
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

  test.each(['settings', 'add-device', 'uploads'])('stream ignores the %s dialog argument while teleop is mounted', async (dialog) => {
    const online = devices.map((device) => ({
      ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2',
    }));
    const { store } = await renderApp(`/${FIRST}/stream?dialog=${dialog}`, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Share by email or user id')).not.toBeInTheDocument();
    expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload queue')).not.toBeInTheDocument();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ dongleId: FIRST, streamNav: true, selectedRouteId: null });
  });

  test('device browser history restores exact dashboards', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${SECOND}`));
    expect(await screen.findByText('Second device recent route start')).toBeVisible();
    expect(screen.queryByText('Mock recent route start')).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ dongleId: SECOND, device: { dongle_id: SECOND }, routesMeta: { dongleId: SECOND } });
    expect(history.location.pathname).toBe(`/${SECOND}`);
    act(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState()).toMatchObject({ dongleId: FIRST, device: { dongle_id: FIRST }, routesMeta: { dongleId: FIRST } });
    expect(history.location.pathname).toBe(`/${FIRST}`);
    act(() => history.goForward());
    expect(await screen.findByText('Second device recent route start')).toBeVisible();
    expect(store.getState()).toMatchObject({ dongleId: SECOND, device: { dongle_id: SECOND }, routesMeta: { dongleId: SECOND } });
    expect(history.location.pathname).toBe(`/${SECOND}`);
  });

  test('PUSH loads a same-device drive missing from the dashboard, and REPLACE changes the drive', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState().routes.map((route) => route.log_id)).toEqual([RECENT_LOG]);

    act(() => history.push(`/${FIRST}/${LOG}/0/20`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState()).toMatchObject({
      dongleId: FIRST,
      selectedRouteId: LOG,
      currentRoute: { fullname: `${FIRST}|${LOG}` },
      zoom: { start: 0, end: 20000 },
      loop: { startTime: 0, duration: 20000 },
    });
    expect(routeRequests().some(({ url }) => new URL(url).searchParams.get('route_str') === `${FIRST}|${LOG}`)).toBe(true);

    act(() => history.replace(`/${FIRST}/${RECENT_LOG}`));
    await waitFor(() => expect(store.getState().currentRoute?.fullname).toBe(`${FIRST}|${RECENT_LOG}`));
    expect(screen.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState()).toMatchObject({ selectedRouteId: RECENT_LOG, zoom: { start: 0, end: 60000 } });
    act(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState().selectedRouteId).toBeNull();
  });

  test('settings for another device opens from a deep link and a fresh store without changing the drive', async () => {
    const path = `/${FIRST}/${LOG}/0/20?dialog=settings&dialogDevice=${SECOND}`;
    let app = await renderApp(path);
    const expectSettingsOverDrive = async () => {
      expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
      expect(screen.getAllByText('Device settings')).toHaveLength(1);
      expect(screen.getByLabelText('Drive timeline')).toBeInTheDocument();
      expect(app.store.getState()).toMatchObject({
        dongleId: FIRST,
        device: { dongle_id: FIRST },
        selectedRouteId: LOG,
        currentRoute: { fullname: `${FIRST}|${LOG}` },
        zoom: { start: 0, end: 20000 },
      });
    };
    await expectSettingsOverDrive();
    app.unmount();
    app = await renderApp(path);
    await expectSettingsOverDrive();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument());
    expect(app.history.location.pathname).toBe(`/${FIRST}/${LOG}/0/20`);
    expect(app.history.location.search).toBe('');
    expect(app.history.index).toBe(0);
    expect(app.store.getState().selectedRouteId).toBe(LOG);
  });

  test('the settings button pushes the explicit target while keeping the selected dashboard', async () => {
    const { history, store } = await renderApp(`/${FIRST}?source=shared#drives`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    const target = await screen.findByRole('link', { name: new RegExp(`Alpha.*${SECOND}`) });
    fireEvent.click(within(target).getByRole('button', { name: 'device settings' }));
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(new URLSearchParams(history.location.search).get('dialog')).toBe('settings');
    expect(new URLSearchParams(history.location.search).get('dialogDevice')).toBe(SECOND);
    expect(new URLSearchParams(history.location.search).get('source')).toBe('shared');
    expect(history.location.hash).toBe('#drives');
    expect(history.action).toBe('PUSH');
    expect(store.getState()).toMatchObject({ dongleId: FIRST, device: { dongle_id: FIRST }, selectedRouteId: null });
  });

  test('settings PUSH, Back, Forward, and close preserve loaded drive data, range, and playback', async () => {
    const path = `/${FIRST}/${LOG}/10/20`;
    const { history, store } = await renderApp(`${path}?source=shared#segment`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => {
      store.dispatch(pause());
      store.dispatch(seek(15000));
    });
    const before = driveState(store);
    const requestCount = routeRequests().length;

    act(() => history.push(`${path}?source=shared&dialog=settings&dialogDevice=${SECOND}#segment`));
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    expect(driveState(store)).toEqual(before);
    expect(store.getState().routes).toBe(before.routes);
    expect(store.getState().currentRoute).toBe(before.currentRoute);
    expect(store.getState().filter).toBe(before.filter);
    expect(history.index).toBe(1);

    act(() => history.goBack());
    await waitFor(() => expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument());
    expect(driveState(store)).toEqual(before);
    act(() => history.goForward());
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument());
    expect(history.location).toMatchObject({ pathname: path, search: '?source=shared', hash: '#segment' });
    expect(history.action).toBe('REPLACE');
    expect(history.index).toBe(1);
    expect(driveState(store)).toEqual(before);
    expect(routeRequests()).toHaveLength(requestCount);
  });

  test.each([
    ['unlisted device', 'dddddddddddddddd', devices],
    ['shared device', SHARED, [...devices, { alias: 'Shared', dongle_id: SHARED, device_type: 'threex', is_owner: false, prime: false }]],
  ])('settings URL for an %s does not expose owner controls', async (_name, target, deviceList) => {
    const { store } = await renderApp(`/${FIRST}?dialog=settings&dialogDevice=${target}`, { devices: deviceList });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Share by email or user id')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ dongleId: FIRST, device: { dongle_id: FIRST } });
    expect(mocks.requests.every(({ method }) => method === 'GET')).toBe(true);
  });

  test('date filter opens from a deep link and cancel retains the loaded dashboard', async () => {
    const { history, store } = await renderApp(`/${FIRST}?dialog=time-filter&source=shared#drives`);
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(screen.getByText('End date:')).toBeVisible();
    const { routes, filter } = store.getState();
    const requestCount = routeRequests().length;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location).toMatchObject({ pathname: `/${FIRST}`, search: '?source=shared', hash: '#drives' });
    expect(history.action).toBe('REPLACE');
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().filter).toBe(filter);
    expect(routeRequests()).toHaveLength(requestCount);
  });

  test.each([
    ['files', 'Road camera'],
    ['route-info', 'View in useradmin'],
    ['clips', 'Create a clip'],
    ['uploads', 'Upload queue'],
  ])('%s opens from a drive deep link without changing the selected range', async (dialog, content) => {
    const options = dialog === 'clips' ? {
      clipsSupported: true,
      devices: devices.map((device) => ({
        ...device, openpilot_version: '0.11.2', last_athena_ping: Math.floor(Date.now() / 1000),
      })),
    } : {};
    const { history, store } = await renderApp(`/${FIRST}/${LOG}/0/20?dialog=${dialog}`, options);
    expect(await screen.findByText(content)).toBeVisible();
    expect(screen.getByLabelText('Drive timeline')).toBeInTheDocument();
    expect(store.getState()).toMatchObject({
      dongleId: FIRST,
      selectedRouteId: LOG,
      currentRoute: { fullname: `${FIRST}|${LOG}` },
      zoom: { start: 0, end: 20000 },
    });
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/0/20`);
  });

  test('direct add-device URL opens one pairing screen without requesting the camera or pairing', async () => {
    const { history, store } = await renderApp(`/${FIRST}?dialog=add-device`);
    expect(await screen.findByText('Pair device')).toBeVisible();
    expect(screen.getAllByText('Pair device')).toHaveLength(1);
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    expect(mocks.requests.every(({ method }) => method === 'GET')).toBe(true);
    expect(store.getState()).toMatchObject({ dongleId: FIRST, selectedRouteId: null });
    expect(history.location.search).toBe('?dialog=add-device');
    fireEvent.keyDown(screen.getByText('Pair device'), { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
    expect(history.location).toMatchObject({ pathname: `/${FIRST}`, search: '' });
    expect(history.action).toBe('REPLACE');
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });

  test.each([
    `/prefix${FIRST}`,
    `/${FIRST}/${LOG}/10`,
    `/${FIRST}/${LOG}/20/10`,
    `/${FIRST}/${LOG}/0/Infinity`,
  ])('malformed URL %s shows not found without selecting a remembered device', async (path) => {
    const { history, store } = await renderApp(path, { selected: FIRST });
    expect(await screen.findByText('Page not found.')).toBeVisible();
    expect(screen.queryByText('Mock recent route start')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ dongleId: null, selectedRouteId: null, zoom: null });
    expect(routeRequests()).toHaveLength(0);
    expect(history.location.pathname).toBe(path);
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
