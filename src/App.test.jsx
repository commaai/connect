import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { pushTimelineRange } from './actions';
import { fetchDriveCoords } from './actions/cached';
import { pause, seek } from './timeline/playback';
import { fetchUploadQueue, cancelFetchUploadQueue } from './actions/files';

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
vi.mock('./api/clips', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, clipDevice: {
    ...actual.clipDevice,
    getClipState: (...args) => mocks.options.clips
      ? Promise.resolve({ clips: mocks.options.clips }) : actual.clipDevice.getClipState(...args),
    hasClipBlob: (...args) => mocks.options.clips ? Promise.resolve(false) : actual.clipDevice.hasClipBlob(...args),
    getClipUrl: (...args) => mocks.options.clips ? Promise.resolve(`blob:${args[0]}`) : actual.clipDevice.getClipUrl(...args),
    deleteClip: (...args) => mocks.options.clips ? mocks.options.pendingDelete : actual.clipDevice.deleteClip(...args),
  } };
});

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
    events: mocks.options.unloadedAssets ? undefined : [], fullname: `${dongleId}|${logId}`, maxqlog: 0,
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
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
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
    if (options.pendingLegacy && url.searchParams.get('start') === String(START)) await options.pendingLegacy;
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
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname.endsWith('/subscription')) return json(options.subscription ?? null);
  if (url.pathname.endsWith('/switch_plan')) {
    await options.pendingSwitch;
    return json({ success: true });
  }
  if (url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.pathname.endsWith('/athena_offline_queue')) return json([]);
  if (url.hostname === 'athena.comma.ai') {
    const method = JSON.parse(init.body || '{}').method;
    mocks.requests[mocks.requests.length - 1].rpc = method;
    return json({ jsonrpc: '2.0', id: 0, result: method === 'listUploadQueue' ? options.uploadQueue || [] : {} });
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
  beforeAll(() => {
    URL.revokeObjectURL = vi.fn();
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
    cancelFetchUploadQueue();
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

  test('sign-in retains the full settings return link', async () => {
    const url = `/${FIRST}?modal=settings&device=${SECOND}`;
    await renderApp(url, { authenticated: false });
    expect(sessionStorage.getItem('redirectURL')).toBe(url);
  });

  test('a missing clip drive retains its query in the login redirect', async () => {
    const url = `/${FIRST}/2026-08-06--99-99-99?modal=clip&clip=road.mp4`;
    await renderApp(url, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(url)}`));
  });

  test('root pairing link remains open after default device selection', async () => {
    const { history } = await renderApp('/?modal=add-device');
    expect(await screen.findByText('Pair device')).toBeVisible();
    expect(history.location.search).toBe('?modal=add-device');
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('legacy timestamp URL converts after a successful lookup', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
  });

  test('legacy conversion retains an open dialog', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}?modal=filter`);
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(history.location.search).toBe('?modal=filter');
    expect(screen.getByText('Start date:')).toBeVisible();
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

  test('settings can open over a stream URL', async () => {
    const online = devices.map(device => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
    await renderApp(`/${FIRST}/stream?modal=settings`, { devices: online });
    expect(await screen.findByRole('textbox', { name: 'Device name' })).toHaveValue('Zulu');
  });

  test('device browser history restores exact dashboards', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${SECOND}`));
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeVisible();
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    act(() => history.goForward());
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeVisible();
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
  test('a dialog URL preserves the loaded drive and playback state', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    act(() => { store.dispatch(pause()); store.dispatch(seek(12000)); });
    const before = store.getState();
    const requestCount = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    act(() => history.push(`/${FIRST}/${LOG}?modal=filter`));
    const after = store.getState();
    expect(after.navigation.modal).toBe('filter');
    for (const key of ['routes', 'currentRoute', 'files', 'filter', 'zoom', 'loop', 'offset', 'desiredPlaySpeed', 'limit']) {
      expect(after[key]).toBe(before[key]);
    }
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(requestCount);
    act(() => history.goBack());
    expect(store.getState().offset).toBe(12000);
  });

  test('a zero-start selection updates both the URL and playback range', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    act(() => store.dispatch(pushTimelineRange(LOG, 0, 20000)));
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/0/20`);
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 20000 });
  });

  test('a delayed legacy lookup cannot replace a newer location', async () => {
    let resolveLegacy;
    const pendingLegacy = new Promise(resolve => { resolveLegacy = resolve; });
    const { history, store } = await renderApp(`/${FIRST}/${START}/${START + 60000}`, { pendingLegacy });
    act(() => history.push(`/${SECOND}`));
    await act(async () => { resolveLegacy(); await pendingLegacy; });
    expect(history.location.pathname).toBe(`/${SECOND}`);
    expect(store.getState().dongleId).toBe(SECOND);
    expect(store.getState().selectedRouteId).toBeNull();
  });

  test.each([
    ['filter', 'Start date:'], ['add-device', 'Pair device'], ['uploads', 'Upload queue'],
  ])('the %s dialog opens from a cold URL', async (modal, title) => {
    const { history } = await renderApp(`/${FIRST}?modal=${modal}`);
    expect(await screen.findByText(title)).toBeVisible();
    expect(history.location.search).toBe(`?modal=${modal}`);
    expect(mocks.requests.filter(request => /pilotpair|unpair|set_device_alias/.test(request.url))).toEqual([]);
  });

  test('settings target another device without replacing the underlying drive', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}?modal=settings&device=${SECOND}`);
    expect(await screen.findByRole('textbox', { name: 'Device name' })).toHaveValue('Alpha');
    expect(store.getState()).toMatchObject({ dongleId: FIRST, selectedRouteId: LOG });
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
  });

  test('settings draft survives opening uploads and browser Back', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=settings`);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Device name' }), { target: { value: 'My unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    act(() => history.goBack());
    expect(await screen.findByRole('textbox', { name: 'Device name' })).toHaveValue('My unsaved draft');
  });

  test('opening a filter during a legacy lookup still resolves the drive', async () => {
    let resolveLegacy;
    const pendingLegacy = new Promise(resolve => { resolveLegacy = resolve; });
    const { history } = await renderApp(`/${FIRST}`);
    mocks.options.pendingLegacy = pendingLegacy;
    const legacy = `/${FIRST}/${START}/${START + 60000}`;
    act(() => history.push(legacy));
    act(() => history.push(`${legacy}?modal=filter`));
    await act(async () => { resolveLegacy(); await pendingLegacy; });
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(history.location.search).toBe('?modal=filter');
    expect(screen.getByText('Start date:')).toBeVisible();
  });

  test('a direct drive does not enter the previously loaded dashboard list', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    const list = store.getState().routes;
    const metadata = store.getState().routesMeta;
    act(() => history.push(`/${FIRST}/${LOG}`));
    await screen.findByRole('slider', { name: 'Drive timeline' });
    expect(store.getState().routes).toBe(list);
    expect(store.getState().routesMeta).toBe(metadata);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Mock route start')).not.toBeInTheDocument();
  });

  test('a drive still plays when the dashboard list is empty', async () => {
    const { history, store } = await renderApp(`/${FIRST}`, { emptyList: true });
    act(() => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByText('Files')).toBeVisible();
    expect(store.getState().routes).toEqual([]);
    expect(store.getState().currentRoute.log_id).toBe(LOG);
  });

  test('a missing drive finishes loading with a not-found message', async () => {
    await renderApp(`/${FIRST}/${LOG}`, { emptyRoutes: true });
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
  });

  test('a cold drive loads events and coordinates without a dashboard list', async () => {
    const { store } = await renderApp(`/${SECOND}/${LOG}`, { unloadedAssets: true });
    await waitFor(() => expect(store.getState().currentRoute?.events).toEqual([]));
    await act(async () => { await store.dispatch(fetchDriveCoords(store.getState().currentRoute)); });
    expect(store.getState().currentRoute.driveCoords).toEqual({});
    expect(store.getState().routes).toBeNull();
  });

  test('a filter draft resets when its URL changes device', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=filter`);
    const initialDate = document.querySelector('input[type="date"]').value;
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2026-02-01' } });
    act(() => history.push(`/${SECOND}?modal=filter`));
    expect(document.querySelector('input[type="date"]')).toHaveValue(initialDate);
  });

  test.each([
    ['files', 'Road camera'], ['info', 'View in useradmin'], ['clips', 'Create a clip'],
  ])('drive %s opens from a URL and browser history restores it', async (modal, title) => {
    const { history } = await renderApp(`/${FIRST}/${LOG}?modal=${modal}`);
    expect(await screen.findByText(title)).toBeVisible();
    act(() => history.push(`/${FIRST}/${LOG}`));
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    act(() => history.goBack());
    expect(await screen.findByText(title)).toBeVisible();
  });

  test('unpair opens by URL without unpairing the device', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=unpair`);
    expect(await screen.findByText('Unpair device')).toBeVisible();
    expect(mocks.requests.filter(request => request.method !== 'GET')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.search).toBe('');
  });

  test.each([
    ['prime-cancel', 'Cancel subscription', 'Cancel prime subscription'], ['prime-switch', 'Confirm switch', 'Switch to Lite plan'],
  ])('%s opens by URL without changing billing', async (modal, button, heading) => {
    const { history } = await renderApp(`/${FIRST}/prime?modal=${modal}`, {
      devices: devices.map(device => ({ ...device, prime: true })),
      subscription: { user_id: 'test-user', plan: 'data', subscribed_at: 1786017600, next_charge_at: 1788696000 },
    });
    expect(await screen.findByRole('button', { name: button })).toBeVisible();
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(mocks.requests.filter(request => request.method !== 'GET')).toEqual([]);
    act(() => history.push(`/${FIRST}/prime`));
    await waitFor(() => expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument());
    act(() => history.goBack());
    expect(await screen.findByRole('button', { name: button })).toBeVisible();
  });

  test('delete clip opens by URL without deleting or downloading it', async () => {
    await renderApp(`/${FIRST}/${LOG}?modal=delete-clip&clip=road.mp4`);
    expect(await screen.findByRole('heading', { name: 'Delete clip?' })).toBeVisible();
    expect(mocks.requests.filter(request => request.method !== 'GET')).toEqual([]);
    expect(document.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  test('browser Back and Forward retain an in-progress Prime switch target', async () => {
    let resolveSwitch;
    const pendingSwitch = new Promise(resolve => { resolveSwitch = resolve; });
    const { history } = await renderApp(`/${FIRST}/prime`, {
      devices: devices.map(device => ({ ...device, prime: true })), pendingSwitch,
      subscription: { user_id: 'test-user', plan: 'data', subscribed_at: 1786017600, next_charge_at: 1788696000 },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Lite plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    act(() => history.goBack());
    act(() => history.goForward());
    mocks.options.subscription = { ...mocks.options.subscription, plan: 'nodata' };
    await act(async () => { resolveSwitch(); await pendingSwitch; });
    expect(await screen.findByRole('heading', { name: 'Welcome to Lite' })).toBeVisible();
  });

  test.each([
    ['closes its own dialog', false, ''],
    ['keeps a newer settings dialog open', true, '?modal=settings'],
  ])('finishing a clip deletion %s', async (_name, openSettings, expectedSearch) => {
    let resolveDelete;
    const pendingDelete = new Promise(resolve => { resolveDelete = resolve; });
    const { history } = await renderApp(`/${FIRST}?modal=delete-clip&clip=road.mp4`, {
      devices: devices.map(device => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) })),
      clips: [{ filename: 'road.mp4', status: 'ready' }], pendingDelete,
    });
    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    fireEvent.click(deleteButton);
    if (openSettings) {
      act(() => history.push(`/${FIRST}?modal=settings`));
      await screen.findByRole('textbox', { name: 'Device name' });
    }
    await act(async () => { resolveDelete(); await pendingDelete; });
    expect(history.location.search).toBe(expectedSearch);
    expect(screen.queryAllByRole('textbox', { name: 'Device name' })).toHaveLength(openSettings ? 1 : 0);
  });

  test('non-owners cannot open device settings through a URL', async () => {
    await renderApp(`/${FIRST}?modal=settings`, { devices: devices.map(device => ({ ...device, is_owner: false })) });
    expect(screen.queryByRole('textbox', { name: 'Device name' })).not.toBeInTheDocument();
  });

  test('filter clicks, close, Back and Forward agree with the dialog URL', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(history.location.search).toBe('?modal=filter');
    expect(screen.getByText('Start date:')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.search).toBe('');
    act(() => history.goBack());
    expect(await screen.findByText('Start date:')).toBeVisible();
    act(() => history.goForward());
    await waitFor(() => expect(screen.queryByText('Start date:')).not.toBeInTheDocument());
  });

  test('a saved filter survives closing, reopening and browser history', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const startDate = document.querySelector('input[type="date"]');
    const chosenDate = '2026-02-01';
    fireEvent.change(startDate, { target: { value: chosenDate } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const filter = store.getState().filter;
    expect(filter.start).toBe(new Date(2026, 1, 1).getTime());
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(document.querySelector('input[type="date"]')).toHaveValue(chosenDate);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() => history.goBack());
    expect(document.querySelector('input[type="date"]')).toHaveValue(chosenDate);
    act(() => history.goForward());
    expect(store.getState().filter).toBe(filter);
  });

  test('an offline clip link shows an offline message and can be closed', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}?modal=clip&clip=road.mp4`);
    expect(await screen.findByRole('dialog', { name: 'Clip' })).toBeVisible();
    expect(within(screen.getByRole('dialog', { name: 'Clip' })).getByText('Device offline')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close video' }));
    expect(history.location.search).toBe('');
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
  });

  test('a same-named clip on another device loads that device’s video', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=clip&clip=road.mp4`, {
      devices: devices.map(device => ({ ...device, last_athena_ping: Math.floor(Date.now() / 1000) })),
      clips: [{ filename: 'road.mp4', status: 'ready', camera: 'fcamera.hevc', source_start_time: 0, source_end_time: 20 }],
    });
    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', `blob:${FIRST}`));
    act(() => history.push(`/${SECOND}?modal=clip&clip=road.mp4`));
    await waitFor(() => expect(document.querySelector('video')).toHaveAttribute('src', `blob:${SECOND}`));
  });

  test('an empty file-menu queue allows another upload status fetch', async () => {
    const { store } = await renderApp(`/${FIRST}/${LOG}`);
    fireEvent.click(screen.getByText('Files'));
    const requests = () => mocks.requests.filter(request => request.rpc === 'listUploadQueue');
    await waitFor(() => expect(requests()).toHaveLength(1));
    await waitFor(() => expect(store.getState().filesUploadingMeta.dongleId).toBe(FIRST));
    await act(async () => { await store.dispatch(fetchUploadQueue(FIRST)); });
    expect(requests()).toHaveLength(2);
  });

  test('leaving an active file-menu queue stops polling the old device', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`, {
      uploadQueue: [{ id: 'upload', url: `https://uploads.example/${FIRST}/${LOG}/0/fcamera.hevc`, current: true, progress: 0.5 }],
    });
    fireEvent.click(screen.getByText('Files'));
    const requests = () => mocks.requests.filter(request => request.rpc === 'listUploadQueue');
    await waitFor(() => expect(requests()).toHaveLength(1));
    act(() => history.push(`/${SECOND}`));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2200)); });
    expect(requests()).toHaveLength(1);
  });

  test('switching the upload dialog target polls the new device', async () => {
    const { history, store } = await renderApp(`/${FIRST}?modal=uploads`, {
      uploadQueue: [{ id: 'upload', url: `https://uploads.example/${FIRST}/${LOG}/0/fcamera.hevc`, current: true, progress: 0.5 }],
    });
    await waitFor(() => expect(store.getState().filesUploadingMeta.dongleId).toBe(FIRST));
    act(() => history.push(`/${FIRST}?modal=uploads&device=${SECOND}`));
    await waitFor(() => expect(store.getState().filesUploadingMeta.dongleId).toBe(SECOND));
    expect(mocks.requests.some(request => request.rpc === 'listUploadQueue' && request.url.includes(SECOND))).toBe(true);
  });

});
