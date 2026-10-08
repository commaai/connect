import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { openModal } from './actions/navigation';
import { pause, seek } from './timeline/playback';
import { clipDevice } from './api/clips';

const mocks = vi.hoisted(() => ({ authenticated: true, options: {}, requests: [], videoMounts: 0, hardNavigate: vi.fn() }));

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
vi.mock('./api/clips', () => ({
  deviceSupportsClips: vi.fn(async () => true),
  clipDevice: {
    getClipState: vi.fn(async () => ({ clips: [{ filename: 'drive.mp4', status: 'ready', camera: 'fcamera.hevc', source_start_time: 0, source_end_time: 10, requested_at: 1 }], cameras: {} })),
    hasClipBlob: vi.fn(async () => true),
    getClipUrl: vi.fn(async () => 'blob:drive-preview'),
  },
}));
vi.mock('react-player/file', () => ({
  default: React.forwardRef((_props, ref) => {
    React.useEffect(() => { mocks.videoMounts += 1; }, []);
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
    if (options.emptyList) return json([]);
    if (window.location.pathname.includes(`/${START}/`) || url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json(deviceList.find((device) => device.dongle_id === dongleId) || { alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') {
    const method = JSON.parse(init.body || '{}').method;
    return json({ jsonrpc: '2.0', id: 0, result: method === 'listUploadQueue' ? [] : {} });
  }
  throw new Error(`Unhandled request: ${init.method || 'GET'} ${url.href}`);
}

async function renderApp(pathname, options = {}) {
  mocks.authenticated = options.authenticated !== false;
  mocks.options = options;
  mocks.requests = [];
  mocks.videoMounts = 0;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: options.width || 1024 });
  window.history.replaceState({}, '', pathname);
  if (options.selected) localStorage.setItem('selectedDongleId', options.selected);
  const history = createMemoryHistory({ initialEntries: [pathname] });
  const store = createAppStore(history, createInitialState(history.location));
  let view;
  await act(async () => { view = render(<App history={history} store={store} />); });
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
    URL.revokeObjectURL = vi.fn();
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
      navigation: { routeId: LOG },
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
    const pathname = `/${FIRST}/2026-08-06--99-99-99?keep=value#anchor`;
    await renderApp(pathname, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(pathname)}`));
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
    await act(async () => history.goBack());
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
  });

  test('stream close and browser history restore its view', async () => {
    const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
    const { history } = await renderApp(`/${FIRST}/stream`, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close teleop' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    await act(async () => history.goBack());
    expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
  });

  test('device browser history restores exact dashboards', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await act(async () => history.push(`/${SECOND}`));
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
    await act(async () => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    await act(async () => history.goForward());
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
    await act(async () => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: 'Close' })));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
  });

  test.each([
    ['settings', 'Device settings'], ['uploads', 'Upload queue'], ['pair', 'Pair device'],
    ['filter', 'Start date:'], ['clips', 'CLIPS ON THIS DEVICE'],
  ])('%s modal opens on a cold link and after a fresh mount', async (modal, text) => {
    const pathname = `/${FIRST}?modal=${modal}`;
    const first = await renderApp(pathname, { width: 375 });
    expect(await screen.findByText(text)).toBeVisible();
    first.unmount();
    const refreshed = await renderApp(pathname, { width: 375 });
    expect(await screen.findByText(text)).toBeVisible();
    expect(refreshed.history.location.search).toBe(`?modal=${modal}`);
  });

  test('settings close from a cold link preserves the underlying drive and independent arguments', async () => {
    const path = `/${FIRST}/${LOG}/0/20?keep=value&modal=settings&device=${SECOND}#anchor`;
    const { store, history } = await renderApp(path);
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    const player = await screen.findByTestId('video-player');
    const route = store.getState().currentRoute;
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.search).toBe('?keep=value'));
    expect(history.location.hash).toBe('#anchor');
    expect(store.getState().zoom).toEqual({ start: 0, end: 20000 });
    expect(store.getState().currentRoute).toBe(route);
    expect(screen.getByTestId('video-player')).toBe(player);
  });

  test('settings, nested uploads, back, and forward preserve drive data and local form state', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}/10/20`, { width: 1440 });
    const player = await screen.findByTestId('video-player');
    act(() => { store.dispatch(seek(15000)); store.dispatch(pause()); });
    const before = store.getState();
    const routeRequests = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    fireEvent.click(screen.getAllByRole('button', { name: 'device settings' })[0]);
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    fireEvent.change(screen.getByLabelText('Device name'), { target: { value: 'Unsaved name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByLabelText('Device name')).toHaveValue('Unsaved name');
    await act(async () => history.goBack());
    await waitFor(() => expect(history.location.search).toBe(''));
    await act(async () => history.goForward());
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(screen.getByTestId('video-player')).toBe(player);
    expect(mocks.videoMounts).toBe(1);
    expect(store.getState().currentRoute).toBe(before.currentRoute);
    expect(store.getState().offset).toBe(before.offset);
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(routeRequests);
  });

  test('settings opens another device\'s Prime page in one navigation', async () => {
    const { history, store } = await renderApp(`/${FIRST}`, { width: 1440 });
    fireEvent.click(screen.getAllByRole('button', { name: 'device settings' })[0]);
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    expect(store.getState().dongleId).toBe(FIRST);
    const historyLength = history.length;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prime settings' })));
    expect(history.location.pathname).toBe(`/${SECOND}/prime`);
    expect(history.length).toBe(historyLength + 1);
    expect(store.getState().dongleId).toBe(SECOND);
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    await act(async () => history.goBack());
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('changing a range preserves the player while changing a drive replaces its local media state', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    const player = await screen.findByTestId('video-player');
    await act(async () => history.push(`/${FIRST}/${LOG}/0/20`));
    expect(store.getState().zoom).toEqual({ start: 0, end: 20000 });
    expect(screen.getByTestId('video-player')).toBe(player);
    await act(async () => history.push(`/${FIRST}/${RECENT_LOG}/0/20`));
    await waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(RECENT_LOG));
    expect(screen.getByTestId('video-player')).not.toBe(player);
    expect(mocks.videoMounts).toBe(2);
  });

  test('a drive outside an empty dashboard list still renders its media', async () => {
    const { history, store } = await renderApp(`/${FIRST}`, { emptyList: true });
    expect(store.getState().routes).toEqual([]);
    await act(async () => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByTestId('video-player')).toBeVisible();
    expect(store.getState().routes).toEqual([]);
  });

  test('query-only navigation updates modal target and Prime return arguments', async () => {
    const { history, store } = await renderApp(`/${FIRST}/prime`);
    const routeList = store.getState().routes;
    await act(async () => history.push(`/${FIRST}/prime?stripe_cancelled=1&modal=settings&device=${FIRST}`));
    expect(await screen.findByLabelText('Device name')).toHaveValue('Zulu');
    await act(async () => history.replace(`/${FIRST}/prime?stripe_cancelled=1&modal=settings&device=${SECOND}`));
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    expect(store.getState().navigation.stripeCancelled).toBe('1');
    expect(store.getState().routes).toBe(routeList);
  });

  test('signed-out modal links retain their complete login return URL', async () => {
    const pathname = `/${FIRST}/${LOG}?modal=settings&device=${FIRST}#anchor`;
    const { history } = await renderApp(pathname, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(sessionStorage.getItem('redirectURL')).toBe(pathname);
    await act(async () => history.push(`/${FIRST}/prime?stripe_cancelled=1`));
    await waitFor(() => expect(sessionStorage.getItem('redirectURL')).toBe(`/${FIRST}/prime?stripe_cancelled=1`));
  });

  test('pairing opens from the no-device page and closes through browser history', async () => {
    const { history } = await renderApp('/', { devices: [] });
    fireEvent.click(screen.getAllByRole('button', { name: 'add new device' })[0]);
    expect(await screen.findByText('Pair device')).toBeVisible();
    expect(history.location.search).toBe('?modal=pair');
    await act(async () => history.goBack());
    await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
    await act(async () => history.goForward());
    expect(await screen.findByText('Pair device')).toBeVisible();
  });

  test('a clip preview opens from its URL and Back restores the inventory', async () => {
    const online = devices.map((device) => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) }));
    const { store, history } = await renderApp(`/${FIRST}/${LOG}?modal=clips`, { devices: online });
    expect(await screen.findByText('CLIPS ON THIS DEVICE')).toBeVisible();
    await act(async () => store.dispatch(openModal('clips', FIRST, 'drive.mp4')));
    expect(await screen.findByRole('button', { name: 'Close video' })).toBeVisible();
    const previewUrl = history.location.pathname + history.location.search;
    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    await waitFor(() => expect(history.location.search).toBe('?modal=clips'));
    await act(async () => history.goForward());
    expect(await screen.findByRole('button', { name: 'Close video' })).toBeVisible();
    expect(history.location.pathname + history.location.search).toBe(previewUrl);
  });

  test('a clip preview can refresh on another device without using the underlying drive', async () => {
    const online = devices.map((device) => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) }));
    const path = `/${FIRST}/${LOG}?modal=clips&device=${SECOND}&clip=drive.mp4`;
    clipDevice.getClipState.mockClear();
    const first = await renderApp(path, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close video' })).toBeVisible();
    expect(clipDevice.getClipState).toHaveBeenCalledWith(SECOND, {});
    first.unmount();
    const refreshed = await renderApp(path, { devices: online });
    expect(await screen.findByRole('button', { name: 'Close video' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    await waitFor(() => expect(refreshed.history.location.search).toBe(''));
    expect(refreshed.store.getState().dongleId).toBe(FIRST);
  });

  test('an upload modal reloads when only its device argument changes', async () => {
    const { history, store } = await renderApp(`/${FIRST}?modal=uploads`);
    await waitFor(() => expect(store.getState().filesUploadingMeta.dongleId).toBe(FIRST));
    await act(async () => history.replace(`/${FIRST}?modal=uploads&device=${SECOND}`));
    await waitFor(() => expect(store.getState().filesUploadingMeta.dongleId).toBe(SECOND));
    expect(store.getState().dongleId).toBe(FIRST);
  });

  test('a pending clip download cannot reopen a preview after its URL changes', async () => {
    let resolvePreview;
    clipDevice.getClipUrl.mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve; }));
    const online = devices.map((device) => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) }));
    const { history } = await renderApp(`/${FIRST}?modal=clips&clip=drive.mp4`, { devices: online });
    await act(async () => history.replace(`/${FIRST}?modal=clips`));
    await act(async () => resolvePreview('blob:outdated-preview'));
    expect(screen.queryByRole('button', { name: 'Close video' })).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:outdated-preview');
  });


  test('closing pairing while camera permission is pending releases a late camera stream', async () => {
    let resolveCamera;
    const getUserMedia = vi.fn(() => new Promise((resolve) => { resolveCamera = resolve; }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]), getUserMedia,
    } });
    try {
      const { history } = await renderApp(`/${FIRST}?modal=pair`);
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
      await act(async () => history.push(`/${FIRST}`));
      const stop = vi.fn();
      await act(async () => resolveCamera({ getTracks: () => [{ stop }] }));
      expect(stop).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    } finally {
      delete navigator.mediaDevices;
    }
  });

  test('unknown device modal links show a closable fallback', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=settings&device=dddddddddddddddd`);
    expect(await screen.findByText('Device unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.search).toBe(''));
  });

});
