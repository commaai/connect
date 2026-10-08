import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { checkRoutesData, updateDevice } from './actions';

const mocks = vi.hoisted(() => ({ authenticated: true, options: {}, requests: [], rpcRequests: [], hardNavigate: vi.fn() }));

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
vi.mock('localforage', () => {
  const storage = {
    getItem: vi.fn(async () => null), setItem: vi.fn(async () => null),
    removeItem: vi.fn(async () => null), keys: vi.fn(async () => []),
  };
  return { default: { ...storage, createInstance: () => storage } };
});
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
const OLDER_LOG = '2026-08-05--12-00-00';
const START = Date.UTC(2026, 7, 6, 12);

const devices = [
  { alias: 'Zulu', dongle_id: FIRST, device_type: 'threex', is_owner: true, prime: false },
  { alias: 'Alpha', dongle_id: SECOND, device_type: 'threex', is_owner: true, prime: false },
];

function makeRoute(dongleId, logId = RECENT_LOG) {
  const [day, time] = logId.split('--');
  const start = Date.parse(`${day}T${time.replaceAll('-', ':')}Z`);
  return {
    create_time: start, distance: 1, dongle_id: dongleId, end_time_utc_millis: start + 60_000,
    events: [], fullname: `${dongleId}|${logId}`, maxqlog: 0,
    segment_end_times: [start + 60_000], segment_numbers: [0], segment_start_times: [start],
    startLocation: { place: logId === LOG ? 'Mock route start' : logId === OLDER_LOG ? 'Mock older route start' : 'Mock recent route start', details: 'Start details' },
    endLocation: { place: 'Mock route end', details: 'End details' }, start_time_utc_millis: start,
    url: 'https://routes.example.com',
  };
}

function json(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

async function mockFetch(input, init = {}) {
  const url = new URL(input.url ?? String(input));
  mocks.requests.push({ method: init.method || 'GET', url: url.href });
  const options = mocks.options;
  const deviceList = options.devices ?? devices;
  if (url.pathname === '/v1/me/turn') return json(null);
  if (url.pathname === '/v1/me/') return json(options.profile ?? { id: 'test-user', superuser: false });
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
    if (options.delayedDevice === dongleId) return json(await options.deviceRoutesResponse);
    if (options.legacyResponse && url.searchParams.get('start') === String(START)) {
      return json(await options.legacyResponse);
    }
    if (options.failedRoutes && url.searchParams.has('start')) return json({}, 500);
    if (options.emptyRoutes) return json([]);
    const routeStr = url.searchParams.get('route_str');
    if (routeStr) return json([LOG, RECENT_LOG, OLDER_LOG].some((log) => routeStr.endsWith(`|${log}`)) ? [makeRoute(dongleId, routeStr.split('|')[1])] : []);
    if (window.location.pathname.includes(`/${START}/`) || url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) {
    if (url.pathname.includes(`/${options.delayedStatsDevice}/`)) return json(await options.statsResponse);
    return json(options.stats ?? null);
  }
  if (url.pathname.endsWith('/athena_offline_queue')) return options.failedQueue ? json({}, 500) : json([]);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    if (!deviceList.some((device) => device.dongle_id === dongleId)) {
      const status = options.sharedDeviceStatus ?? 200;
      if (Object.hasOwn(options, 'sharedDeviceResponse')) return json(await options.sharedDeviceResponse, status);
      if (status !== 200) return json({}, status);
    }
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false, ...options.sharedDevice });
  }
  if (url.pathname.endsWith('/subscription')) return json(options.subscription ?? null);
  if (url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname === '/v1/prime/cancel') return json({ success: true });
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files')) return options.failedFiles ? json({}, 500) : json({});
  if (url.pathname.endsWith('/preserved')) return json([]);
  if (url.hostname === 'athena.comma.ai') {
    const payload = JSON.parse(init.body);
    mocks.rpcRequests.push(payload.method);
    const results = {
      listUploadQueue: [],
      getClipState: { clips: options.clips ?? [], cameras: {} },
      getVersion: { commit_date: 1_800_000_000 },
    };
    const result = results[payload.method] ?? {};
    return json({ jsonrpc: '2.0', id: payload.id, result });
  }
  throw new Error(`Unhandled request: ${init.method || 'GET'} ${url.href}`);
}

async function renderApp(pathname, options = {}) {
  mocks.authenticated = options.authenticated !== false;
  mocks.options = options;
  mocks.requests = [];
  mocks.rpcRequests = [];
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

const routeRequestCount = () => mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;

function modalName(history) {
  return new URLSearchParams(history.location.search).get('modal');
}

async function changeLocation(change) {
  await act(async () => {
    change();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('whole-app behavior', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(mockFetch));
    vi.stubGlobal('PointerEvent', MouseEvent);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: { height: 800 }, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true });
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
    window.innerWidth = 1280;
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

  test.each([['no stored device', undefined], ['an unknown stored device', 'dddddddddddddddd']])('root selects the first visible sorted device with %s', async (_name, selected) => {
    const { history } = await renderApp('/', { selected });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(SECOND);
    const firstDeviceLink = screen.getAllByRole('link').find((link) => devices.some((device) => link.getAttribute('href') === `/${device.dongle_id}`));
    expect(firstDeviceLink).toHaveAttribute('href', `/${SECOND}`);
  });

  test('root with no devices shows pairing', async () => {
    const { history } = await renderApp('/', { devices: [] });
    expect(await screen.findByRole('heading', { name: 'Pair your device' })).toBeVisible();
    expect(history.location.pathname).toBe('/');
    expect(screen.queryByRole('link', { name: /Shared device/ })).not.toBeInTheDocument();
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

  test.each([
    ['missing dashboard', '', { sharedDeviceStatus: 404 }, 'Device not found.'],
    ['forbidden Prime', '/prime', { sharedDeviceStatus: 403 }, 'You do not have access to this device.'],
    ['unavailable stream', '/stream', { sharedDeviceStatus: 500 }, 'Unable to load device. Please try again.'],
    ['empty device response', '', { sharedDeviceResponse: null }, 'Unable to load device. Please try again.'],
  ])('a %s link displays its device failure without opening a page for the wrong device', async (_name, page, options, error) => {
    const pathname = `/${SHARED}${page}`;
    const { history, store } = await renderApp(pathname, options);
    expect(await screen.findByText(error)).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
    expect(store.getState()).toMatchObject({ dongleId: SHARED, deviceError: error });
    expect(screen.queryByRole('heading', { name: 'comma prime' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close teleop' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
  });

  test('retrying a failed device lookup loads that device and clears the error', async () => {
    const { history, store } = await renderApp(`/${SHARED}`, { sharedDeviceStatus: 500 });
    expect(await screen.findByText('Unable to load device. Please try again.')).toBeVisible();
    const deviceRequests = () => mocks.requests.filter(({ url }) => url.endsWith(`/v1.1/devices/${SHARED}/`)).length;
    const beforeRetry = deviceRequests();
    mocks.options.sharedDeviceStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(deviceRequests()).toBe(beforeRetry + 1);
    expect(store.getState()).toMatchObject({ dongleId: SHARED, deviceError: null, device: { dongle_id: SHARED } });
    expect(history.location.pathname).toBe(`/${SHARED}`);
  });

  test('returning from a missing device selects the first visible device and clears the failure', async () => {
    const { history, store } = await renderApp(`/${SHARED}`, { sharedDeviceStatus: 404 });
    expect(await screen.findByText('Device not found.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Go to your devices' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(store.getState()).toMatchObject({ dongleId: SECOND, deviceError: null, selectedRouteId: null, zoom: null });
    expect(screen.queryByText('Device not found.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
  });

  test('a device lookup failure does not block an accessible public drive', async () => {
    const pathname = `/${SHARED}/${LOG}`;
    const { history } = await renderApp(pathname, { authenticated: false, sharedDeviceStatus: 404 });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(screen.queryByText('Device not found.')).not.toBeInTheDocument();
    expect(mocks.hardNavigate).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe(pathname);
  });

  test('a late failed device lookup cannot cover a newer device dashboard', async () => {
    let finishDevice;
    const sharedDeviceResponse = new Promise((resolve) => { finishDevice = resolve; });
    const { history, store } = await renderApp(`/${SHARED}`, { sharedDeviceStatus: 404, sharedDeviceResponse });
    await waitFor(() => expect(mocks.requests.some(({ url }) => url.endsWith(`/v1.1/devices/${SHARED}/`))).toBe(true));
    await changeLocation(() => history.push(`/${SECOND}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await act(async () => { finishDevice({}); });
    expect(store.getState()).toMatchObject({ dongleId: SECOND, deviceError: null });
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(screen.getByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Device not found.')).not.toBeInTheDocument();
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

  test('a cold drive range ending past the drive is replaced while preserving its settings overlay', async () => {
    const search = `?modal=settings&modalDevice=${SECOND}&source=bookmark`;
    const { history, store } = await renderApp(`/${FIRST}/${LOG}/10/90${search}#video`);
    expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/10/60`));
    expect(history.location).toMatchObject({ search, hash: '#video' });
    expect(history.length).toBe(1);
    expect(store.getState()).toMatchObject({
      zoom: { start: 10000, end: 60000 }, loop: { startTime: 10000, duration: 50000 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location).toMatchObject({ pathname: `/${FIRST}/${LOG}/10/60`, search: '?source=bookmark', hash: '#video' });
  });

  test('a warm oversized range and browser history restore matching URL and playback bounds', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    const requests = routeRequestCount();
    await changeLocation(() => history.push(`/${FIRST}/${LOG}/10/90?source=shared#video`));
    expect(history.location).toMatchObject({ pathname: `/${FIRST}/${LOG}/10/60`, search: '?source=shared', hash: '#video' });
    expect(history.length).toBe(2);
    expect(store.getState()).toMatchObject({ zoom: { start: 10000, end: 60000 }, loop: { startTime: 10000, duration: 50000 } });
    await changeLocation(() => history.goBack());
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(store.getState()).toMatchObject({ zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 } });
    await changeLocation(() => history.goForward());
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/10/60`);
    expect(store.getState()).toMatchObject({ zoom: { start: 10000, end: 60000 }, loop: { startTime: 10000, duration: 50000 } });
    expect(routeRequestCount()).toBe(requests);
  });

  test.each([['cold', false], ['warm', true]])('a %s range entirely outside the drive stops playback until full-drive recovery', async (_name, warm) => {
    const wholeDrive = `/${FIRST}/${LOG}`;
    const invalidRange = `${wholeDrive}/70/90?source=bookmark#video`;
    const { history, store } = await renderApp(warm ? wholeDrive : invalidRange);
    if (warm) {
      await screen.findByRole('slider', { name: 'Drive timeline' });
      await changeLocation(() => history.push(invalidRange));
    }
    expect(await screen.findByText('This time range is outside the drive.')).toBeVisible();
    expect(history.location.pathname).toBe(`${wholeDrive}/70/90`);
    expect(store.getState()).toMatchObject({ zoom: null, loop: null });
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
    const historyLength = history.length;
    fireEvent.click(screen.getByRole('button', { name: 'View full drive' }));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location).toMatchObject({ pathname: wholeDrive, search: '?source=bookmark', hash: '#video' });
    expect(history.length).toBe(historyLength);
    expect(store.getState()).toMatchObject({ zoom: { start: 0, end: 60000 }, loop: { startTime: 0, duration: 60000 }, navigationError: null });
  });

  test.each([
    ['private device', `/${FIRST}`], ['Prime', `/${FIRST}/prime`], ['stream', `/${FIRST}/stream`],
  ])('signed-out %s entry retains its path', async (_name, pathname) => {
    const { history } = await renderApp(pathname, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
  });

  test('a missing public route redirects to login with the requested route', async () => {
    const pathname = `/${FIRST}/2026-08-07--12-00-00`;
    await renderApp(pathname, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(pathname)}`));
  });

  test('legacy timestamp URL converts after a successful lookup', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
  });

  test.each([['empty', { emptyRoutes: true }], ['failed', { failedRoutes: true }]])('legacy timestamp remains after an %s lookup', async (result, options) => {
    const pathname = `/${FIRST}/${START}/${START + 60_000}`;
    const { history } = await renderApp(pathname, options);
    expect(await screen.findByText(result === 'empty'
      ? 'No drive found for this link.'
      : 'Unable to load this drive. Please try again.')).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
  });

  test('Prime close and browser history restore its view', async () => {
    const { history } = await renderApp(`/${FIRST}/prime`);
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    await changeLocation(() => history.goBack());
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
  });

  test('stream close and browser history restore its view', async () => {
    const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
    const { history } = await renderApp(`/${FIRST}/stream`, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close teleop' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    await changeLocation(() => history.goBack());
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
  });

  test('device browser history restores exact dashboards', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await changeLocation(() => history.push(`/${SECOND}`));
    await waitFor(() => expect(store.getState().device.dongle_id).toBe(SECOND));
    expect(store.getState().dongleId).toBe(SECOND);
    expect(history.location.pathname).toBe(`/${SECOND}`);
    await changeLocation(() => history.goBack());
    await waitFor(() => expect(store.getState().device.dongle_id).toBe(FIRST));
    expect(store.getState().dongleId).toBe(FIRST);
    expect(history.location.pathname).toBe(`/${FIRST}`);
    await changeLocation(() => history.goForward());
    await waitFor(() => expect(store.getState().device.dongle_id).toBe(SECOND));
    expect(store.getState().dongleId).toBe(SECOND);
    expect(history.location.pathname).toBe(`/${SECOND}`);
  });

  test('PUSH and REPLACE update the visible page and selected route', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await changeLocation(() => history.push(`/${FIRST}/${RECENT_LOG}/0/20.125`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState()).toMatchObject({
      selectedRouteId: RECENT_LOG, zoom: { start: 0, end: 20125 },
    });
    await changeLocation(() => history.replace(`/${FIRST}/prime`));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    expect(store.getState().selectedRouteId).toBeNull();
    await changeLocation(() => history.push('/referrals'));
    expect(await screen.findByRole('heading', { name: /Refer a friend/ })).toBeVisible();
    await changeLocation(() => history.goBack());
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
  });

  test('filter URLs support Back, Forward, and close without reopening on Back', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const { routes, filter, limit } = store.getState();
    const requests = routeRequestCount();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(modalName(history)).toBe('filter');
    await changeLocation(() => history.goBack());
    await waitFor(() => expect(screen.queryByText('Start date:')).not.toBeInTheDocument());
    await changeLocation(() => history.goForward());
    expect(await screen.findByText('Start date:')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(history.index).toBe(0);
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().filter).toBe(filter);
    expect(store.getState().limit).toBe(limit);
    expect(routeRequestCount()).toBe(requests);
  });

  test.each([`/${FIRST}`, '/demo'])('a cold filter URL on %s survives startup and closes in place', async (pathname) => {
    const start = new Date(2024, 0, 1).getTime();
    const end = new Date(2024, 11, 31, 23, 59, 59, 999).getTime();
    const dates = `from=${start}&to=${end}`;
    const { history, store } = await renderApp(`${pathname}?modal=filter&${dates}&source=bookmark#routes`);
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(store.getState().filter).toEqual({ start, end });
    expect([...document.querySelectorAll('input[type="date"]')].map((input) => input.value)).toEqual(['2024-01-01', '2024-12-31']);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(history.location).toMatchObject({ pathname, search: `?${dates}&source=bookmark`, hash: '#routes' });
    expect(history.length).toBe(1);
  });

  test('settings deep links open with the mobile drawer closed', async () => {
    window.innerWidth = 800;
    const { history } = await renderApp(`/${FIRST}?modal=settings`);
    expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(history.length).toBe(1);
  });

  test.each([['refreshes an untouched name', false], ['preserves a name being edited', true]])('settings %s when device details refresh', async (_name, editing) => {
    const { store } = await renderApp(`/${FIRST}?modal=settings`);
    const name = await screen.findByRole('textbox', { name: 'Device name' });
    expect(name).toHaveValue('Zulu');
    if (editing) fireEvent.change(name, { target: { value: 'My unfinished name' } });
    await act(async () => store.dispatch(updateDevice({ ...devices[0], alias: 'Refreshed name' })));
    expect(name).toHaveValue(editing ? 'My unfinished name' : 'Refreshed name');
  });

  test('closing and reopening settings discards unsaved name and sharing drafts', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=settings`);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Device name' }), { target: { value: 'Unsaved name' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Share by email or user id' }), { target: { value: 'unsaved@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(modalName(history)).toBeNull());
    const deviceLink = screen.getByRole('link', { name: new RegExp(`Zulu ${FIRST}`) });
    fireEvent.click(within(deviceLink.parentElement).getByRole('link', { name: 'device settings' }));
    expect(await screen.findByRole('textbox', { name: 'Device name' })).toHaveValue('Zulu');
    expect(screen.getByRole('textbox', { name: 'Share by email or user id' })).toHaveValue('');
  });

  test('settings for another device preserve the drive and range underneath', async () => {
    const pathname = `/${FIRST}/${LOG}/10/20`;
    const { history, store } = await renderApp(pathname);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    const { routes, currentRoute, zoom, filter } = store.getState();
    const requests = routeRequestCount();
    const otherDevice = screen.getByRole('link', { name: new RegExp(`Alpha ${SECOND}`) });
    fireEvent.click(within(otherDevice.parentElement).getByRole('link', { name: 'device settings' }));
    expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
    expect(new URLSearchParams(history.location.search).get('modalDevice')).toBe(SECOND);
    expect(store.getState().dongleId).toBe(FIRST);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().currentRoute).toBe(currentRoute);
    expect(store.getState().zoom).toBe(zoom);
    expect(store.getState().filter).toBe(filter);
    expect(routeRequestCount()).toBe(requests);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

  test.each([
    ['settings-unpair', 'Unpair device', 'Cancel'],
    ['settings-uploads', 'Upload queue', 'Close'],
  ])('cold %s closes to settings without changing the background device', async (modal, title, closeLabel) => {
    const { history, store } = await renderApp(`/${FIRST}?modal=${modal}&modalDevice=${SECOND}`);
    const heading = await screen.findByRole('heading', { name: title });
    expect(heading).toBeVisible();
    fireEvent.click(within(heading.parentElement.parentElement).getByRole('button', { name: closeLabel }));
    expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
    expect(modalName(history)).toBe('settings');
    expect(new URLSearchParams(history.location.search).get('modalDevice')).toBe(SECOND);
    expect(store.getState().dongleId).toBe(FIRST);
    expect(history.length).toBe(1);
    expect(mocks.requests.filter(({ method, url }) => method !== 'GET' && new URL(url).hostname !== 'athena.comma.ai')).toEqual([]);
  });

  test('pairing deep links mount one dialog and history restores it', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=add-device`);
    expect(await screen.findByRole('heading', { name: 'Pair device' })).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'Pair device' })).toHaveLength(1);
    await changeLocation(() => history.push(`/${FIRST}`));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Pair device' })).not.toBeInTheDocument());
    await changeLocation(() => history.goBack());
    expect(await screen.findByRole('heading', { name: 'Pair device' })).toBeVisible();
  });

  test.each([
    ['drive-info', 'View in useradmin'],
    ['drive-files', 'Road camera'],
    ['drive-clips', 'Create a clip'],
  ])('cold %s links open the requested drive overlay and preserve its range on close', async (modal, label) => {
    const pathname = `/${FIRST}/${LOG}/0/20.125`;
    const { history, store } = await renderApp(`${pathname}?modal=${modal}`);
    expect(await screen.findByText(label)).toBeVisible();
    expect(store.getState()).toMatchObject({ selectedRouteId: LOG, zoom: { start: 0, end: 20125 } });
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(history.location.pathname).toBe(pathname);
    expect(history.length).toBe(1);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 20125 });
  });

  test('a cold drive upload queue closes to the files overlay', async () => {
    const pathname = `/${FIRST}/${LOG}/10/20`;
    const { history, store } = await renderApp(`${pathname}?modal=drive-uploads`);
    const heading = await screen.findByRole('heading', { name: 'Upload queue' });
    expect(heading).toBeVisible();
    fireEvent.click(within(heading.parentElement.parentElement).getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Road camera')).toBeVisible();
    expect(modalName(history)).toBe('drive-files');
    expect(history.location.pathname).toBe(pathname);
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 20000 });
  });

  test('a cold files overlay survives API failures and its Retry action recovers', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${OLDER_LOG}?modal=drive-files`, {
      failedFiles: true, failedQueue: true,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load files. Try again.');
    expect(mocks.requests.some(({ url }) => url.includes('/athena_offline_queue'))).toBe(true);
    mocks.options.failedFiles = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(store.getState().files).not.toBeNull());
    expect(modalName(history)).toBe('drive-files');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape', keyCode: 27 });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

  test('a cold device clips link opens its inventory and closes to the dashboard', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=device-clips`);
    expect(await screen.findByText('CLIPS ON THIS DEVICE')).toBeVisible();
    expect(screen.queryByText('Create a clip')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test('an offline clip video deep link explains the unavailable video and closes to its clip menu', async () => {
    const pathname = `/${FIRST}/${LOG}/10/20`;
    const { history } = await renderApp(`${pathname}?modal=drive-clips&clip=sample.mp4&clipAction=view`);
    expect(await screen.findByText('Device offline. Reconnect to view this clip.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    await waitFor(() => expect(new URLSearchParams(history.location.search).has('clip')).toBe(false));
    expect(modalName(history)).toBe('drive-clips');
    expect(history.location.pathname).toBe(pathname);
    expect(await screen.findByText('Create a clip')).toBeVisible();
  });

  test('a missing clip deep link can close without a download or delete request', async () => {
    const online = devices.map((device) => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) }));
    const { history } = await renderApp(`/${FIRST}?modal=device-clips&clip=missing.mp4&clipAction=view`, { devices: online });
    expect(await screen.findByText('This clip is no longer available on the device.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    await waitFor(() => expect(new URLSearchParams(history.location.search).has('clip')).toBe(false));
    expect(modalName(history)).toBe('device-clips');
    expect(mocks.rpcRequests).not.toContain('getClipChunk');
    expect(mocks.rpcRequests).not.toContain('deleteClip');
  });

  test('a clip delete deep link requires confirmation and Cancel retains the clip menu', async () => {
    const online = devices.map((device) => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) }));
    const { history } = await renderApp(`/${FIRST}?modal=device-clips&clip=sample.mp4&clipAction=delete`, {
      devices: online,
      clips: [{ filename: 'sample.mp4', status: 'ready', route: LOG, camera: 'fcamera.hevc', source_start_time: 0, source_end_time: 10, speedup: 1, requested_at: 1 }],
    });
    expect(await screen.findByRole('heading', { name: 'Delete clip?' })).toBeVisible();
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled());
    expect(mocks.rpcRequests).not.toContain('deleteClip');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(new URLSearchParams(history.location.search).has('clip')).toBe(false));
    expect(modalName(history)).toBe('device-clips');
    expect(mocks.rpcRequests).not.toContain('deleteClip');
  });

  test.each([
    ['prime-cancel', 'Cancel prime subscription', 'Close'],
    ['prime-switch&plan=nodata', 'Switch to Lite plan', 'Cancel'],
  ])('cold %s shows its confirmation without performing billing changes', async (modal, title, closeLabel) => {
    const { history } = await renderApp(`/${FIRST}/prime?modal=${modal}`, {
      devices: devices.map((device) => ({ ...device, prime: true })),
      subscription: { user_id: 'test-user', plan: 'data', amount: 2400, subscribed_at: 1_700_000_000, next_charge_at: 1_800_000_000 },
    });
    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: closeLabel }));
    await waitFor(() => expect(modalName(history)).toBeNull());
    expect(history.location.pathname).toBe(`/${FIRST}/prime`);
    expect(mocks.requests.every(({ method }) => method === 'GET')).toBe(true);
  });

  test('Prime confirmation state is isolated when history switches devices', async () => {
    const { history } = await renderApp(`/${FIRST}/prime?modal=prime-cancel`, {
      devices: devices.map((device) => ({ ...device, prime: true })),
      subscription: { user_id: 'test-user', plan: 'data', amount: 2400, subscribed_at: 1_700_000_000, next_charge_at: 1_800_000_000 },
    });
    const heading = await screen.findByRole('heading', { name: 'Cancel prime subscription' });
    fireEvent.click(within(heading.parentElement).getByRole('button', { name: 'Cancel subscription' }));
    expect(await screen.findByText('Cancelled subscription.')).toBeVisible();
    await changeLocation(() => history.push(`/${SECOND}/prime?modal=prime-cancel`));
    const nextHeading = await screen.findByRole('heading', { name: 'Cancel prime subscription' });
    expect(screen.queryByText('Cancelled subscription.')).not.toBeInTheDocument();
    expect(within(nextHeading.parentElement).getByRole('button', { name: 'Cancel subscription' })).toBeEnabled();
  });

  test('a superuser without listed devices can open Prime for a permitted device URL', async () => {
    const { history, store } = await renderApp(`/${SHARED}/prime`, {
      devices: [], profile: { id: 'test-user', superuser: true }, sharedDevice: { prime: true },
      subscription: { user_id: 'test-user', plan: 'data', amount: 2400, subscribed_at: 1_700_000_000, next_charge_at: 1_800_000_000 },
    });
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Cancel subscription' })).toBeEnabled();
    expect(history.location.pathname).toBe(`/${SHARED}/prime`);
    expect(store.getState().device).toMatchObject({ dongle_id: SHARED, prime: true });
    expect(store.getState().subscription.user_id).toBe('test-user');
  });

  test('same-device Prime and referrals navigation reuses dashboard data', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const { routes, filter, limit } = store.getState();
    const requests = routeRequestCount();
    await changeLocation(() => history.push(`/${FIRST}/prime`));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    await changeLocation(() => history.push('/referrals'));
    expect(await screen.findByRole('heading', { name: /Refer a friend/ })).toBeVisible();
    await changeLocation(() => history.push(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState().routes).toBe(routes);
    expect(store.getState().filter).toBe(filter);
    expect(store.getState().limit).toBe(limit);
    expect(routeRequestCount()).toBe(requests);
  });

  test('closing a cold drive loads the dashboard route list', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(store.getState().selectedRouteId).toBeNull();
    expect(store.getState().routesMeta).toMatchObject({ dongleId: FIRST, start: store.getState().filter.start, end: store.getState().filter.end });
  });

  test('a missing drive never displays a previously viewed drive or loses the dashboard cache', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const dashboardRoutes = store.getState().routes;
    const pathname = `/${FIRST}/2026-08-07--12-00-00`;
    await changeLocation(() => history.push(pathname));
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(store.getState().currentRoute).toBeNull();
    const requests = routeRequestCount();
    await changeLocation(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState().routes).toBe(dashboardRoutes);
    await changeLocation(() => history.goForward());
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
    expect(routeRequestCount()).toBe(requests);
  });

  test('opening an older drive preserves the dashboard filter and its matching route list', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const defaultFilter = store.getState().filter;
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const [startDate, endDate] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(startDate, { target: { value: '2026-08-06' } });
    fireEvent.change(endDate, { target: { value: '2026-08-06' } });
    await changeLocation(() => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const { filter, limit } = store.getState();
    expect(filter).toEqual({
      start: new Date(2026, 7, 6).setHours(0, 0, 0, 0),
      end: new Date(2026, 7, 6).setHours(23, 59, 59, 999),
    });
    const params = new URLSearchParams(history.location.search);
    expect(params.get('from')).toBe(String(filter.start));
    expect(params.get('to')).toBe(String(filter.end));
    expect(params.get('modal')).toBeNull();
    await changeLocation(() => history.goBack());
    expect(store.getState().filter).toEqual(defaultFilter);
    await changeLocation(() => history.goForward());
    expect(store.getState().filter).toEqual(filter);
    const selectedDevice = screen.getByRole('link', { name: new RegExp(`Zulu ${FIRST}`) });
    expect(selectedDevice).toHaveAttribute('href', `/${FIRST}?from=${filter.start}&to=${filter.end}`);
    await changeLocation(() => fireEvent.click(selectedDevice));
    expect(store.getState().filter).toEqual(filter);
    const restoredFilter = store.getState().filter;
    const requests = routeRequestCount();
    await changeLocation(() => history.push(`/${FIRST}/${OLDER_LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(screen.getByRole('link', { name: new RegExp(`Zulu ${FIRST}`) })).toHaveAttribute('href', `/${FIRST}?from=${filter.start}&to=${filter.end}`);
    await changeLocation(() => fireEvent.click(screen.getByRole('button', { name: 'Close' })));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Mock older route start')).not.toBeInTheDocument();
    expect(store.getState().filter).toBe(restoredFilter);
    expect(store.getState().limit).toBe(limit);
    expect(routeRequestCount()).toBe(requests + 1);
  });

  test('browser Back restores zoom ancestry before the drive zoom-out button is used', async () => {
    const pathname = `/${FIRST}/${LOG}`;
    const { history, store } = await renderApp(pathname);
    const timeline = await screen.findByRole('slider', { name: 'Drive timeline' });
    const selectRange = () => {
      fireEvent.pointerDown(timeline, { button: 0, clientX: 200, pageX: 200 });
      fireEvent.pointerMove(document, { clientX: 700, pageX: 700 });
      fireEvent.pointerUp(document, { button: 0, clientX: 700, pageX: 700 });
    };
    selectRange();
    await waitFor(() => expect(history.location.pathname).not.toBe(pathname));
    const firstPath = history.location.pathname;
    expect(firstPath).not.toBe(pathname);
    selectRange();
    await waitFor(() => expect(history.location.pathname).not.toBe(firstPath));
    expect(history.location.pathname).not.toBe(firstPath);
    await changeLocation(() => history.goBack());
    expect(history.location.pathname).toBe(firstPath);
    expect(store.getState().zoom.previous).toMatchObject({ start: 0, end: 60000 });
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    await waitFor(() => expect(history.location.pathname).toBe(pathname));
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 60000 });
    expect(store.getState().zoom.previous).toBeNull();
  });

  test('signed-out navigation switches between the login page and a public drive', async () => {
    const { history } = await renderApp(`/${FIRST}`, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    await changeLocation(() => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await changeLocation(() => history.goBack());
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    await changeLocation(() => history.goForward());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

  test.each([
    `/prefix${FIRST}`,
    `/${FIRST}/${LOG}/20/10`,
    `/${FIRST}/${LOG}/NaN/20`,
    `/${FIRST}/${LOG}/0/20/extra`,
    '/unknown/page',
  ])('invalid URL %s shows a recoverable missing page', async (pathname) => {
    const { history, store } = await renderApp(pathname);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
    expect(store.getState().selectedRouteId).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    await changeLocation(() => history.push(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState().dongleId).toBe(FIRST);
  });

  test('a return URL restores its requested device and modal', async () => {
    const destination = `/${SECOND}?modal=settings&source=return#device`;
    const { history, store } = await renderApp(`/?r=${encodeURIComponent(destination)}`, { selected: FIRST });
    expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
    expect(history.location).toMatchObject({
      pathname: `/${SECOND}`, search: '?modal=settings&source=return', hash: '#device',
    });
    expect(store.getState().dongleId).toBe(SECOND);
  });

  test('a late legacy lookup cannot navigate away from a newer device selection', async () => {
    let finishLookup;
    const legacyResponse = new Promise((resolve) => { finishLookup = resolve; });
    const { history, store } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`, { legacyResponse });
    await waitFor(() => expect(mocks.requests.some(({ url }) => new URL(url).searchParams.get('start') === String(START))).toBe(true));
    await changeLocation(() => history.push(`/${SECOND}`));
    await waitFor(() => expect(store.getState().dongleId).toBe(SECOND));
    await act(async () => { finishLookup([makeRoute(FIRST, LOG)]); });
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(store.getState().dongleId).toBe(SECOND);
    expect(store.getState().selectedRouteId).toBeNull();
  });

  test('a late route list cannot replace the newly selected device data', async () => {
    let finishRoutes;
    const deviceRoutesResponse = new Promise((resolve) => { finishRoutes = resolve; });
    const { history, store } = await renderApp(`/${FIRST}`, { delayedDevice: FIRST, deviceRoutesResponse });
    await changeLocation(() => history.push(`/${SECOND}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await waitFor(() => expect(store.getState().routes[0].dongle_id).toBe(SECOND));
    await act(async () => { finishRoutes([makeRoute(FIRST, LOG)]); });
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(store.getState().routes.every((route) => route.dongle_id === SECOND)).toBe(true);
    expect(screen.getByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Mock route start')).not.toBeInTheDocument();
  });

  test('late statistics from the previous device cannot replace the new dashboard totals', async () => {
    let finishStats;
    const statsResponse = new Promise((resolve) => { finishStats = resolve; });
    const { history, store } = await renderApp(`/${FIRST}`, {
      delayedStatsDevice: FIRST, statsResponse,
      stats: { all: { distance: 222, routes: 22, minutes: 120 } },
    });
    await waitFor(() => expect(mocks.requests.some(({ url }) => url.endsWith(`/${FIRST}/stats`))).toBe(true));
    await changeLocation(() => history.push(`/${SECOND}`));
    expect(await screen.findByText('22')).toBeVisible();
    await act(async () => { finishStats({ all: { distance: 111, routes: 11, minutes: 60 } }); });
    expect(store.getState().dongleId).toBe(SECOND);
    expect(screen.getByText('22')).toBeVisible();
    expect(screen.queryByText('11')).not.toBeInTheDocument();
  });

  test('a late route-list failure cannot replace a newer Prime page with an error', async () => {
    let rejectRoutes;
    const deviceRoutesResponse = new Promise((_resolve, reject) => { rejectRoutes = reject; });
    const consoleError = vi.spyOn(console, 'error');
    try {
      const { history, store } = await renderApp(`/${FIRST}`, { delayedDevice: FIRST, deviceRoutesResponse });
      await changeLocation(() => history.push(`/${FIRST}/prime`));
      expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
      await act(async () => { rejectRoutes(new Error('Temporary route lookup failure')); });
      expect(history.location.pathname).toBe(`/${FIRST}/prime`);
      expect(store.getState().navigationError).toBeFalsy();
      expect(screen.getByRole('heading', { name: 'comma prime' })).toBeVisible();
      expect(consoleError).toHaveBeenCalledWith('Failure fetching routes metadata', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  test('a successful route retry clears the failure and renders the dashboard', async () => {
    const consoleError = vi.spyOn(console, 'error');
    try {
      const { history, store } = await renderApp(`/${FIRST}`, { failedRoutes: true });
      expect(await screen.findByText('Unable to load drives. Please try again.')).toBeVisible();
      expect(consoleError).toHaveBeenCalledWith('Failure fetching routes metadata', expect.any(Error));
      mocks.options.failedRoutes = false;
      await act(async () => { await store.dispatch(checkRoutesData()); });
      expect(await screen.findByText('Mock recent route start')).toBeVisible();
      expect(screen.queryByText('Unable to load drives. Please try again.')).not.toBeInTheDocument();
      expect(store.getState().navigationError).toBeNull();
      expect(history.location.pathname).toBe(`/${FIRST}`);
    } finally {
      consoleError.mockRestore();
    }
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
    await changeLocation(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
  });
});
