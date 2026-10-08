import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';

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
  if (url.pathname === '/v1/me/turn') return json(null);
  if (url.pathname === '/v1/me/') return json({ id: 'test-user', superuser: false });
  if (url.pathname === '/v1/me/devices/') return (options.devicesGate ?? Promise.resolve()).then(() => json(deviceList));
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
    return json({ jsonrpc: '2.0', id: 0, result: JSON.parse(init.body).method === 'listUploadQueue' ? [] : {} });
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
  const store = createAppStore(history, createInitialState());
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

  test.each([['no stored device', undefined], ['an unknown stored device', 'dddddddddddddddd']])('root selects the first listed device with %s', async (_name, selected) => {
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

  test('closing a drive opened from a link shows the whole drive list', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('a cold drive link asks for its route before the device list arrives', async () => {
    let releaseDevices;
    const devicesGate = new Promise((resolve) => { releaseDevices = resolve; });
    await renderApp(`/${FIRST}/${LOG}`, { devicesGate });
    const paths = mocks.requests.map(({ url }) => new URL(url).pathname);
    expect(paths).toContain('/v1/me/devices/');
    expect(paths).toContain(`/v1/devices/${FIRST}/routes_segments`);
    releaseDevices();
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

  test('a signed-in cold dashboard asks for its drives before the device list arrives', async () => {
    let releaseDevices;
    const devicesGate = new Promise((resolve) => { releaseDevices = resolve; });
    // the dashboard shows Loading until it knows its device, so rendering can only finish after the release
    const rendering = renderApp(`/${FIRST}`, { devicesGate });
    try {
      await waitFor(() => expect(mocks.requests.map(({ url }) => new URL(url).pathname)).toContain(`/v1/devices/${FIRST}/routes_segments`));
    } finally {
      releaseDevices();
      await rendering;
    }
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test('a drive outside the loaded list leaves the list in place', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    mocks.requests.splice(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByText('Mock route start')).not.toBeInTheDocument();
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toEqual([]);
  });

  test.each([
    ['widens a drag to whole seconds', 205, 707, 12, 43],
    ['keeps a short drag at one second', 300, 305, 18, 19],
  ])('the timeline %s', async (_name, from, to, start, end) => {
    const { history, store } = await renderApp(`/${FIRST}/${RECENT_LOG}`);
    const timeline = await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.pointerDown(timeline, { button: 0, clientX: from, pageX: from });
    fireEvent.pointerMove(document, { clientX: to, pageX: to });
    fireEvent.pointerUp(document, { button: 0, clientX: to, pageX: to });
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}/${start}/${end}`));
    expect(store.getState().zoom).toEqual({ start: start * 1000, end: end * 1000 });
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

  test('selecting the device already showing adds no history entry', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const entries = history.length;
    fireEvent.click(await screen.findByRole('button', { name: 'menu' }));
    fireEvent.click(await screen.findByRole('link', { name: /Zulu/ }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(history.length).toBe(entries);
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('a trip between drives and devices reuses loaded data', async () => {
    const takeRequests = async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const counts = {};
      for (const { method, url } of mocks.requests.splice(0)) {
        const { hostname, pathname, searchParams } = new URL(url);
        const path = pathname.replace(FIRST, 'FIRST').replace(SECOND, 'SECOND');
        const key = `${method} ${hostname}${path}${searchParams.has('route_str') ? ' (one route)' : ''}`;
        counts[key] = (counts[key] || 0) + 1;
      }
      return counts;
    };
    const openDrive = async () => {
      fireEvent.click(await screen.findByText('Mock recent route start'));
      expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    };
    const switchDevice = async (name, dongleId) => {
      fireEvent.click(await screen.findByRole('button', { name: 'menu' }));
      fireEvent.click(await screen.findByText(name));
      await waitFor(() => expect(history.location.pathname).toBe(`/${dongleId}`));
      expect(await screen.findByText('Mock recent route start')).toBeVisible();
    };
    const trip = {};

    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    trip.dashboard = await takeRequests();
    await openDrive();
    trip['open drive'] = await takeRequests();
    act(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    trip.back = await takeRequests();
    await openDrive();
    trip['reopen drive'] = await takeRequests();
    await switchDevice('Alpha', SECOND);
    trip['switch device'] = await takeRequests();
    await switchDevice('Zulu', FIRST);
    trip['switch back'] = await takeRequests();

    expect(trip).toEqual({
      dashboard: {
        'GET api.comma.ai/v1/me/': 1,
        'GET api.comma.ai/v1/me/devices/': 1,
        'GET api.comma.ai/v1/devices/FIRST/routes_segments': 1,
        'GET billing.comma.ai/v1/prime/subscribe_info': 1,
        'GET api.comma.ai/v1/devices/FIRST/location': 2,
        'GET api.comma.ai/v1.1/devices/FIRST/stats': 1,
      },
      'open drive': {
        'GET api.comma.ai/v1/devices/FIRST/routes/preserved': 3,
      },
      back: {
        'GET api.comma.ai/v1/devices/FIRST/location': 2,
        'GET api.comma.ai/v1.1/devices/FIRST/stats': 1,
      },
      'reopen drive': {
        'GET api.comma.ai/v1/devices/FIRST/routes/preserved': 3,
      },
      'switch device': {
        'GET api.comma.ai/v1/devices/SECOND/routes_segments': 1,
        'GET billing.comma.ai/v1/prime/subscribe_info': 1,
        'GET api.comma.ai/v1.1/devices/SECOND/': 1,
        'GET api.comma.ai/v1/devices/SECOND/location': 3,
        'GET api.comma.ai/v1.1/devices/SECOND/stats': 1,
      },
      'switch back': {
        'GET api.comma.ai/v1/devices/FIRST/routes_segments': 1,
        'GET billing.comma.ai/v1/prime/subscribe_info': 1,
        'GET api.comma.ai/v1.1/devices/FIRST/': 1,
        'GET api.comma.ai/v1/devices/FIRST/location': 3,
        'GET api.comma.ai/v1.1/devices/FIRST/stats': 1,
      },
    });
  });

  test('drive selection, timeline range, back, and close preserve exact URLs', async () => {
    const { history } = await renderApp(`/${FIRST}`, { selected: FIRST });
    fireEvent.click(await screen.findByText('Mock recent route start'));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    const timeline = await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.pointerDown(timeline, { button: 0, clientX: 200, pageX: 200 });
    fireEvent.pointerMove(document, { clientX: 700, pageX: 700 });
    fireEvent.pointerUp(document, { button: 0, clientX: 700, pageX: 700 });
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}/12/42`));
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
  });

  test('browser back and forward move between the dashboard and a drive', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(await screen.findByText('Mock recent route start'));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => history.goBack());
    await waitFor(() => expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument());
    expect(screen.getByText('Mock recent route start')).toBeVisible();
    act(() => history.goForward());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`);
  });

  test('the drive back arrow zooms out to the whole drive', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}/10/20`);
    const back = await screen.findByRole('button', { name: 'Go Back' });
    expect(back).toBeEnabled();
    fireEvent.click(back);
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeDisabled();
  });

  test.each([
    ['settings', 'Device settings'],
    ['uploads', 'Upload queue'],
    ['pair', 'Pair device'],
    ['filter', 'Start date:'],
  ])('the %s modal opens from a cold entry', async (modal, text) => {
    const { history } = await renderApp(`/${FIRST}?modal=${modal}`);
    expect(await within(await screen.findByRole('document')).findByText(text)).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('another device\'s settings open over a drive and close back to it', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}/10/20?modal=settings&device=${SECOND}&ci=1#top`);
    const dialog = await screen.findByRole('document');
    expect(within(dialog).getByText(SECOND)).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Drive timeline', hidden: true })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('document')).not.toBeInTheDocument());
    expect(history.location).toMatchObject({ pathname: `/${FIRST}/${LOG}/10/20`, search: '?ci=1', hash: '#top' });
    expect(screen.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

  test('saving the date filter over a drive keeps the drive', async () => {
    await renderApp(`/${FIRST}/${LOG}?modal=filter`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline', hidden: true })).toBeInTheDocument();
    mocks.requests.splice(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText('Start date:')).not.toBeInTheDocument());
    expect(screen.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toEqual([]);
  });

  test('the drawer opens settings for any device without leaving the page', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(await screen.findByRole('button', { name: 'menu' }));
    const alpha = (await screen.findByText('Alpha')).closest('a');
    fireEvent.click(within(alpha).getByRole('button', { name: 'device settings' }));
    expect(await within(await screen.findByRole('document')).findByText(SECOND)).toBeVisible();
    expect(history.location).toMatchObject({ pathname: `/${FIRST}`, search: `?modal=settings&device=${SECOND}` });

    fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    expect(history.location.search).toBe(`?modal=uploads&device=${SECOND}`);

    act(() => history.goBack());
    fireEvent.click(await screen.findByRole('button', { name: 'Prime settings' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}/prime`));
    expect(history.location.search).toBe('');
  });

  test('pair and filter buttons open their modals by URL', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(history.location.search).toBe('?modal=filter');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(''));

    fireEvent.click(await screen.findByRole('button', { name: 'menu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'add new device' }));
    expect(await screen.findByText('scan QR code')).toBeVisible();
    expect(history.location.search).toBe('?modal=pair');
  });

  test('closing a modal opened in the app goes back, so Back then leaves the page', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${SECOND}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Filter' }));
    expect(await screen.findByText('Start date:')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location).toMatchObject({ pathname: `/${SECOND}`, search: '' }));
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(screen.queryByText('Start date:')).not.toBeInTheDocument();
  });

  test('closing a modal opened from a link replaces its URL', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=filter`);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(history.entries.map(({ pathname, search }) => pathname + search)).toEqual([`/${FIRST}`]);
  });

  test('settings stay closed for a device the user does not own', async () => {
    const { history } = await renderApp(`/${SHARED}?modal=settings`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await waitFor(() => expect(history.location).toMatchObject({ pathname: `/${SHARED}`, search: '' }));
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument();
  });

  test('leaving a drive with a menu open stops its upload polling', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(await screen.findByText('Mock recent route start'));
    fireEvent.click(await screen.findByText('Files'));
    await waitFor(() => expect(mocks.requests).toContainEqual({ method: 'POST', url: `https://athena.comma.ai/${FIRST}` }));
    act(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${FIRST}?modal=uploads&device=${SECOND}`));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    await waitFor(() => expect(mocks.requests).toContainEqual({ method: 'POST', url: `https://athena.comma.ai/${SECOND}` }));
  });
});
