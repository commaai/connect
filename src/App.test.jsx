import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { api } from './api/backend';

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
    if (window.location.pathname.includes(`/${START}/`) || url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/athena_offline_queue')) return json([]);
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname.endsWith('/subscription')) return json(options.subscription || null);
  if (['/v1/prime/switch_plan', '/v1/prime/cancel'].includes(url.pathname) && options.billingMutation) return options.billingMutation;
  if (url.pathname.endsWith('/subscribe_info')) return json(null);
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

  test('a missing public route redirects to login with the requested route, dialog, and hash', async () => {
    const pathname = `/${FIRST}/2026-08-06--99-99-99?dialog=info&ci=one%26two#point`;
    await renderApp(pathname, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(pathname)}`));
  });

  test.each([`/${FIRST}?dialog=settings&device=${SECOND}#point`, '/?dialog=pair#point'])('signed-out link retains the full authentication continuation: %s', async target => {
    const { history } = await renderApp(target, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(sessionStorage.getItem('redirectURL')).toBe(target);
    act(() => history.push(`/${FIRST}/prime?dialog=prime-cancel`));
    expect(sessionStorage.getItem('redirectURL')).toBe(`/${FIRST}/prime?dialog=prime-cancel`);
  });

  test('login redirect parameter decodes the full URL once', async () => {
    const target = `/${FIRST}/${LOG}?dialog=info&ci=one%26two#point`;
    await renderApp(`/?r=${encodeURIComponent(target)}`, { authenticated: false });
    expect(sessionStorage.getItem('redirectURL')).toBe(target);
  });

  test('a newly requested root dialog replaces a stale saved login continuation', async () => {
    sessionStorage.setItem('redirectURL', `/${FIRST}/${LOG}`);
    await renderApp('/?dialog=pair#point', { authenticated: false });
    expect(sessionStorage.getItem('redirectURL')).toBe('/?dialog=pair#point');
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
    await waitFor(() => expect(history.location.pathname).toMatch(new RegExp(`/${FIRST}/${RECENT_LOG}/[0-9.]+/[0-9.]+$`)));
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
  });
  test('regression: direct PUSH opens a drive and reuses dashboard data', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    const routes = store.getState().routes;
    act(() => history.push(`/${FIRST}/${RECENT_LOG}/0/20`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 20000 });
    expect(store.getState().routes).toBe(routes);
  });

  test('regression: closing a cold drive fetches the dashboard instead of reusing one drive', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(store.getState().routes[0].log_id).toBe(RECENT_LOG);
  });

  test('a known drive remains visible when the dashboard filter has no routes', async () => {
    const { store } = await renderApp(`/${FIRST}/${LOG}`);
    act(() => store.dispatch({ type: 'ACTION_ROUTES_METADATA', dongleId: FIRST, routes: [] }));
    expect(store.getState().routes).toEqual([]);
    expect(screen.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(screen.getByTestId('video-player')).toBeVisible();
    expect(screen.queryByText('Route does not exist.')).not.toBeInTheDocument();
  });

  test.each(['files', 'info'])('cached drive navigation loads the correct %s data and restores it with Back', async dialog => {
    const files = vi.spyOn(api.routes, 'getRouteFiles');
    try {
      const { history } = await renderApp(`/${FIRST}/${LOG}?dialog=${dialog}`);
      await waitFor(() => expect(files).toHaveBeenCalledWith(`${FIRST}|${LOG}`, false));
      act(() => history.push(`/${FIRST}/${RECENT_LOG}?dialog=${dialog}`));
      await waitFor(() => expect(files).toHaveBeenCalledWith(`${FIRST}|${RECENT_LOG}`, false));
      files.mockClear();
      act(() => history.goBack());
      await waitFor(() => expect(files).toHaveBeenCalledWith(`${FIRST}|${LOG}`, false));
    } finally {
      files.mockRestore();
    }
  });

  test('regression: settings for another device opens above the mobile drawer and navigates to its Prime page', async () => {
    const oldWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    try {
      const { history, store } = await renderApp(`/${FIRST}/${LOG}?dialog=settings&device=${SECOND}`);
      expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
      const before = store.getState();
      expect(screen.getByRole('textbox', { name: 'Device name' })).toHaveValue('Alpha');
      expect(store.getState().dongleId).toBe(FIRST);
      expect(store.getState().currentRoute.log_id).toBe(LOG);
      fireEvent.click(screen.getByRole('button', { name: /Prime settings/ }));
      await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}/prime`));
      expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
      act(() => history.goBack());
      expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
      expect(before.currentRoute.log_id).toBe(LOG);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: oldWidth });
    }
  });

  test.each(['filter', 'pair'])('regression: cold %s dialog opens without a drawer', async dialog => {
    await renderApp(`/${FIRST}?dialog=${dialog}`);
    expect(await screen.findByText(dialog === 'filter' ? 'Start date:' : 'Pair device')).toBeVisible();
  });

  test.each([SHARED, 'dddddddddddddddd'])('settings stays closed for shared or unknown device %s', async dongle => {
    await renderApp(`/${FIRST}?dialog=settings&device=${dongle}`);
    expect(screen.queryByRole('heading', { name: 'Device settings' })).not.toBeInTheDocument();
  });

  test('cold nested settings upload dialog closes to settings', async () => {
    const { history } = await renderApp(`/${FIRST}?dialog=settings-uploads`);
    expect(await screen.findByText('Uploads')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));
    await waitFor(() => expect(history.location.search).toBe(`?dialog=settings&device=${FIRST}`));
    expect(await screen.findByRole('heading', { name: 'Device settings' })).toBeVisible();
  });

  test.each(['prime-cancel', 'prime-switch'])('cold %s confirms without making a billing change', async dialog => {
    const subscription = { user_id: 'test-user', plan: 'data', amount: 2400, status: 'active', next_charge_at: 1800000000 };
    const { history } = await renderApp(`/${FIRST}/prime?dialog=${dialog}`, {
      devices: devices.map(device => ({ ...device, prime: true })), subscription,
    });
    expect(await screen.findByRole('heading', { name: dialog === 'prime-cancel' ? 'Cancel prime subscription' : 'Switch to Lite plan' })).toBeVisible();
    expect(mocks.requests.some(request => request.method !== 'GET')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: dialog === 'prime-cancel' ? 'Close' : 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(''));
  });

  test.each(['prime-cancel', 'prime-switch'])('pending %s response belongs to the device where it was confirmed', async dialog => {
    let resolveMutation;
    const billingMutation = new Promise(resolve => { resolveMutation = resolve; });
    const subscription = { user_id: 'test-user', plan: 'data', amount: 2400, status: 'active', next_charge_at: 1800000000 };
    const { history } = await renderApp(`/${FIRST}/prime?dialog=${dialog}`, {
      devices: devices.map(device => ({ ...device, prime: true })), subscription, billingMutation,
    });
    fireEvent.click(await screen.findByRole('button', { name: dialog === 'prime-cancel' ? 'Cancel subscription' : 'Confirm switch' }));
    await waitFor(() => expect(mocks.requests.some(request => request.method === 'POST')).toBe(true));
    act(() => history.push(`/${SECOND}/prime?dialog=${dialog}`));
    await waitFor(() => expect(screen.getByRole('button', { name: dialog === 'prime-cancel' ? 'Cancel subscription' : 'Confirm switch' })).toBeEnabled());
    const count = mocks.requests.filter(request => request.url.includes(SECOND) && request.url.includes('/subscription')).length;
    await act(async () => { resolveMutation(await json({ success: true })); await billingMutation; });
    expect(screen.queryByText('Cancelled subscription.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Your subscription has been switched/)).not.toBeInTheDocument();
    expect(mocks.requests.filter(request => request.url.includes(SECOND) && request.url.includes('/subscription')).length).toBe(count);
    expect(history.location.pathname).toBe(`/${SECOND}/prime`);
  });

  test('shared-device billing links keep the existing ownership gate', async () => {
    await renderApp(`/${SHARED}/prime?dialog=prime-cancel`);
    expect(await screen.findByText('No access')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Cancel prime subscription' })).not.toBeInTheDocument();
    expect(mocks.requests.some(request => request.method !== 'GET')).toBe(false);
  });

  test('cold unpair dialog requires an explicit confirmation', async () => {
    const { history } = await renderApp(`/${FIRST}?dialog=unpair`);
    expect(await screen.findByRole('heading', { name: 'Unpair device' })).toBeVisible();
    expect(mocks.requests.some(request => request.method !== 'GET')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(`?dialog=settings&device=${FIRST}`));
  });

  test('root dialog links preserve their query and hash through default device selection', async () => {
    const { history } = await renderApp('/?dialog=filter&ci=1#point');
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(history.location).toMatchObject({ pathname: `/${FIRST}`, search: '?dialog=filter&ci=1', hash: '#point' });
    expect(history.length).toBe(1);
  });

  test('regression: saving a filter opened above a drive retains that drive', async () => {
    const {history,store}=await renderApp(`/${FIRST}/${LOG}?dialog=filter`);
    expect(await screen.findByText('Start date:')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    await waitFor(()=>expect(history.location.search).toBe(''));
    expect(store.getState().currentRoute?.log_id).toBe(LOG);
    expect(await screen.findByRole('slider',{name:'Drive timeline'})).toBeVisible();
  });
  test('regression: unrelated redirect argument on a drive cannot replace the major page', async () => {
    const target=`/${FIRST}/${LOG}?dialog=info&r=%2F${SECOND}`;
    const {history,store}=await renderApp(target);
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(history.location.search).toBe(`?dialog=info&r=%2F${SECOND}`);
    await waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(LOG));
    expect(await screen.findByRole('menu')).toBeVisible();
    fireEvent.keyDown(document.activeElement, { key: 'Escape', code: 'Escape', keyCode: 27 });
    await waitFor(() => expect(history.location.search).toBe(`?r=%2F${SECOND}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

});
