import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { request as Request } from './api';
import { checkLastRoutesData, selectTimeFilter } from './actions';
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
  if (url.pathname === '/v2/auth/') return mocks.authenticated ? json({ access_token: 'test-token' }) : json({ error: 'unavailable' }, 503);
  if (url.pathname === '/v1/me/') return json({ id: 'test-user', superuser: false });
  if (url.pathname === '/v1/me/devices/') return options.devicesLoaded ? options.devicesLoaded.then(() => json(deviceList)) : json(deviceList);
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
    if (routeStr && options.privateRoutes) return json({ error: 'forbidden' }, 403);
    if (routeStr) return json([LOG, RECENT_LOG].some((log) => routeStr.endsWith(`|${log}`)) ? [makeRoute(dongleId, routeStr.split('|')[1])] : []);
    if (url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    if (options.routeCount) {
      const count = Math.min(options.routeCount, Number(url.searchParams.get('limit')));
      return json(Array.from({ length: count }, (_, i) => ({ ...makeRoute(dongleId), fullname: `${dongleId}|2026-08-06--13-0${i}-00` })));
    }
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/stripe_session')) return json({ payment_status: 'paid' });
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') return json({ jsonrpc: '2.0', id: 0, result: JSON.parse(init.body || '{}').method === 'listUploadQueue' ? [] : {} });
  throw new Error(`Unhandled request: ${init.method || 'GET'} ${url.href}`);
}

async function renderApp(pathname, options = {}) {
  mocks.authenticated = options.authenticated !== false;
  mocks.options = options;
  mocks.requests = [];
  window.history.replaceState({}, '', pathname);
  if (options.selected) localStorage.setItem('selectedDongleId', options.selected);
  const history = createMemoryHistory({ initialEntries: [pathname] });
  history.listen(({ pathname: path, search }) => window.history.replaceState({}, '', path + search)); // like a browser
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
    vi.stubGlobal('gtag', vi.fn());
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
    Request.errorResponseCallback = null; // as on a fresh page load
    localStorage.clear();
    sessionStorage.clear();
    mocks.hardNavigate.mockClear();
  });

  test('root opens the stored device', async () => {
    const app = await renderApp('/', { selected: SECOND });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(app.history.location.pathname).toBe(`/${SECOND}`);
    expect(localStorage.getItem('selectedDongleId')).toBe(SECOND);
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
    const { store } = await renderApp('/referrals', { selected: SECOND });
    expect(await screen.findByRole('heading', { name: /Refer a friend/ })).toBeVisible();
    expect((await screen.findAllByText('$50', { selector: 'dd' }))).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'claim rewards ($50)' })).toHaveAttribute(
      'href', expect.stringContaining('Referral%20coupon%3A%20ABC1234'),
    );
    expect(mocks.requests).toContainEqual({ method: 'GET', url: 'https://billing.comma.ai/v1/referrals' });
    expect(store.getState().dongleId).toBe(SECOND);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(0);
  });

  test.each([['owned', FIRST], ['shared', SHARED]])('direct entry opens %s device dashboard', async (_name, dongleId) => {
    const { history } = await renderApp(`/${dongleId}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${dongleId}`);
  });

  test('loading more drives and changing the filter load the right pages', async () => {
    const { store } = await renderApp(`/${FIRST}`, { routeCount: 8 });
    await waitFor(() => expect(store.getState().routes).toHaveLength(5));
    mocks.requests = [];
    await act(async () => { store.dispatch(checkLastRoutesData()); });
    await waitFor(() => expect(store.getState().routes).toHaveLength(8));
    const range = { start: START - 86_400_000, end: START + 86_400_000 };
    await act(async () => { store.dispatch(selectTimeFilter(range.start, range.end)); });
    const lists = () => mocks.requests.filter(({ url }) => url.includes('routes_segments'));
    await waitFor(() => expect(lists()).toHaveLength(2));
    expect(lists()[0].url).toContain('limit=10');
    expect(lists()[1].url).toContain(`start=${range.start}&end=${range.end}&limit=5`);
  });

  test('dashboard filter and empty route states remain usable', async () => {
    await renderApp(`/${FIRST}`, { emptyRoutes: true });
    expect(await screen.findByText('No routes found in selected time range.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.requests.some(({ url }) => url.includes('routes_segments'))).toBe(true);
  });

  test.each([
    ['signed in, zoomed', `/${FIRST}/${LOG}/10/20`, true],
    ['signed out, whole', `/${FIRST}/${LOG}`, false],
  ])('a drive opens from a cold entry, %s', async (_name, pathname, authenticated) => {
    const { history, store } = await renderApp(pathname, { authenticated });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(pathname);
    const zoomed = pathname.endsWith('/10/20');
    expect(store.getState()).toMatchObject({
      nav: { logId: LOG },
      zoom: { start: zoomed ? 10000 : 0, end: zoomed ? 20000 : 60000 },
      loop: { startTime: zoomed ? 10000 : 0, duration: zoomed ? 10000 : 60000 },
    });
  });

  test.each([
    ['private device', `/${FIRST}`],
    ['Prime', `/${FIRST}/prime`],
    ['stream', `/${FIRST}/stream`],
    ['pairing', '/?add-device'],
    ['settings over a shared drive', `/${FIRST}/${LOG}?settings=${FIRST}`],
    ['settings over an old drive link', `/${FIRST}/${START}/${START + 60_000}?settings=${FIRST}`],
  ])('signed-out %s entry keeps its url for sign in and loads nothing', async (_name, url) => {
    sessionStorage.setItem('redirectURL', '/some/older/page');
    const { history } = await renderApp(url, { authenticated: false });
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(history.location.pathname + history.location.search).toBe(url);
    expect(sessionStorage.getItem('redirectURL')).toBe(url);
    expect(mocks.requests.filter(({ url: requested }) => requested.includes('routes_segments'))).toHaveLength(0);
  });

  test.each([
    ['a missing', `/${FIRST}/2026-08-06--99-99-99`, {}],
    ['a private', `/${FIRST}/${LOG}`, { privateRoutes: true }],
  ])('%s drive asks a signed-out visitor to sign in', async (_name, pathname, options) => {
    await renderApp(pathname, { authenticated: false, ...options });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(pathname)}`));
  });

  test('signing in from a shared drive keeps its url', async () => {
    const pathname = `/${FIRST}/${LOG}/10/20`;
    await renderApp(pathname, { authenticated: false });
    fireEvent.click(await screen.findByRole('button', { name: 'account menu' }));
    expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${encodeURIComponent(pathname)}`);
  });

  test.each([
    ['the saved page', `/${FIRST}/${LOG}?settings=${FIRST}`, `/${FIRST}/${LOG}?settings=${FIRST}`],
    ['this site, never another', '//example.com/', `/${FIRST}`],
  ])('signing in returns to %s', async (_name, saved, landing) => {
    sessionStorage.setItem('redirectURL', saved);
    const { history } = await renderApp('/auth/?code=abc&provider=google');
    await waitFor(() => expect(history.location.pathname + history.location.search).toBe(landing));
    expect(sessionStorage.getItem('redirectURL')).toBeNull();
  });

  test('a failed sign in keeps the saved page', async () => {
    sessionStorage.setItem('redirectURL', `/${FIRST}/${LOG}`);
    await renderApp('/auth/?code=abc&provider=google', { authenticated: false });
    expect(sessionStorage.getItem('redirectURL')).toBe(`/${FIRST}/${LOG}`);
  });

  test('leaving a shared drive while signed out asks to sign in', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`, { authenticated: false });
    await screen.findByRole('slider', { name: 'Drive timeline' });
    act(() => history.push(`/${FIRST}`));
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
  });

  test('an unknown url says so, and analytics hide its dongle id', async () => {
    gtag.mockClear();
    await renderApp(`/${FIRST}/not-a-log`, { authenticated: false });
    expect(await screen.findByText('Page not found')).toBeVisible();
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', expect.objectContaining({ page_location: '/<dongleId>/not-a-log' }));
  });

  test('page not found loads nothing, and coming back does not load startup again', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    mocks.requests = [];
    act(() => history.push('/nope'));
    await screen.findByText('Page not found');
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(0);
    act(() => history.goBack());
    await screen.findByRole('slider', { name: 'Drive timeline' });
    expect(mocks.requests.filter(({ url }) => url.endsWith('/v1/me/devices/'))).toHaveLength(0);
  });

  test('settings open over the page and close back to it', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}?stripe_success=cs_1`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'device settings' }))[0]);
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(history.location.pathname + history.location.search).toBe(`/${FIRST}/${LOG}?stripe_success=cs_1&settings=${SECOND}`);
    expect(screen.getByRole('slider', { name: 'Drive timeline', hidden: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.search).toBe('?stripe_success=cs_1'));
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(history.index).toBe(0);
  });

  test('settings open from a link', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}?settings=${FIRST}`);
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(screen.getByLabelText('Device name')).toHaveValue('Zulu');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(history.length).toBe(1);
  });

  test('settings are only for owners', async () => {
    const shared = { alias: 'Shared', dongle_id: SHARED, device_type: 'threex', is_owner: false, prime: false };
    await renderApp(`/${FIRST}?settings=${SHARED}`, { devices: [...devices, shared] });
    expect(await screen.findByText('These device settings are not available.')).toBeVisible();
  });

  test('prime settings go to prime', async () => {
    const { history } = await renderApp(`/${FIRST}?settings=${SECOND}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Prime settings' }));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    expect(history.location.pathname + history.location.search).toBe(`/${SECOND}/prime`);
    expect(history.length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'device settings' }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Prime settings' }));
    await waitFor(() => expect(history.index).toBe(0));
  });

  test('stacked dialogs close back to the page before', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    act(() => history.push(`/${FIRST}/${LOG}?settings=${FIRST}`));
    fireEvent.click(await screen.findByRole('button', { name: 'Uploads' }));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    expect(history.location.search).toBe(`?settings=${FIRST}&uploads=${FIRST}`);
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));
    await waitFor(() => expect(history.location.search).toBe(`?settings=${FIRST}`));
    expect(screen.getByText('Device settings')).toBeVisible();
    // mui 1.5 leaves settings aria-hidden once the modal above it closes
    fireEvent.click(screen.getAllByRole('button', { name: 'Close', hidden: true }).at(-1));
    await waitFor(() => expect(history.location.search).toBe(''));
    act(() => history.goBack());
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('going back past stacked dialogs closes both', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    act(() => history.push(`/${FIRST}?settings=${FIRST}`));
    act(() => history.push(`/${FIRST}?settings=${FIRST}&uploads=${FIRST}`));
    expect(await screen.findByText('Upload queue')).toBeVisible();
    act(() => history.go(-2));
    await waitFor(() => expect(screen.queryByText('Device settings')).not.toBeInTheDocument());
    expect(screen.queryByText('Upload queue')).not.toBeInTheDocument();
  });

  test('uploads open from a link', async () => {
    await renderApp(`/${FIRST}/${LOG}?uploads=${FIRST}`);
    expect(await screen.findByText('Upload queue')).toBeVisible();
  });

  test('adding a device opens over the page and closes back to it', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'add new device' }));
    expect(await screen.findByText('Pair device')).toBeVisible();
    expect(history.location.search).toBe('?add-device');
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(history.location.search).toBe(''));
    expect(history.index).toBe(0);
  });

  test('adding a device from a home page link waits for the devices', async () => {
    let load;
    const rendered = renderApp('/?add-device', { devicesLoaded: new Promise((resolve) => { load = resolve; }) });
    await waitFor(() => expect(mocks.requests.some(({ url }) => url.endsWith('/v1/me/devices/'))).toBe(true));
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
    expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    load();
    const { history } = await rendered;
    expect(await screen.findByText('Pair device')).toBeVisible();
    await waitFor(() => expect(history.location.pathname + history.location.search).toBe(`/${FIRST}?add-device`));
  });

  test.each([false, true])('legacy timestamp converts with cached drive %s', async (cached) => {
    const legacy = `/${FIRST}/${START}/${START + 60_000}`;
    const { history, store } = await renderApp(cached ? `/${FIRST}/${LOG}` : legacy);
    if (cached) act(() => history.replace(legacy));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 60000 });
  });

  test.each([['empty', { emptyRoutes: true }], ['failed', { failedRoutes: true }]])('legacy timestamp remains after an %s lookup', async (_name, options) => {
    const pathname = `/${FIRST}/${START}/${START + 60_000}`;
    const { history } = await renderApp(pathname, options);
    await waitFor(() => expect(mocks.requests.some(({ url }) => url.includes(`start=${START}`))).toBe(true));
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
    expect(history.location.pathname).toBe(pathname);
    expect(await screen.findByText('Page not found')).toBeVisible();
  });

  test('Prime close and browser history restore its view', async () => {
    const { history } = await renderApp(`/${FIRST}/prime`);
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    act(() => history.goBack());
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
  });

  test('prime opens from a drive of the same device, and back returns to it', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    act(() => history.push(`/${FIRST}/prime`));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    act(() => history.goBack());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    expect(history.length).toBe(2);
  });

  test('a drive that loads late still logs its zoom', async () => {
    const { history } = await renderApp(`/${FIRST}`);
    gtag.mockClear();
    act(() => history.push(`/${FIRST}/${LOG}`));
    await screen.findByRole('slider', { name: 'Drive timeline' });
    expect(gtag).toHaveBeenCalledWith('event', 'select_zoom', expect.objectContaining({ start: 0, end: 60_000 }));
  });

  test('closing a linked drive shows the whole drive list (#532)', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(mocks.requests.some(({ url }) => url.includes('routes_segments?') && url.includes('limit=5'))).toBe(true);
  });

  test('a missing drive says so, plays nothing, and is asked for once', async () => {
    const missing = '2026-08-06--99-99-99';
    const { store } = await renderApp(`/${FIRST}/${missing}/10/20`);
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
    expect(store.getState().zoom).toBeNull();
    expect(mocks.requests.filter(({ url }) => url.includes(encodeURIComponent(`|${missing}`)))).toHaveLength(1);
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

  test('switching devices fetches once, and back and forward restore it', async () => {
    const { history, store } = await renderApp(`/${FIRST}`, { selected: SECOND });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(localStorage.getItem('selectedDongleId')).toBe(FIRST);
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    mocks.requests = [];
    fireEvent.click(await screen.findByText('Alpha'));
    const asked = (part) => mocks.requests.filter(({ url }) => url.includes(SECOND) && url.includes(part)).length;
    await waitFor(() => expect([asked('subscribe_info'), asked('routes_segments')]).toEqual([1, 1]));
    expect(history.location.pathname).toBe(`/${SECOND}`);
    act(() => history.goBack());
    await waitFor(() => expect(store.getState().dongleId).toBe(FIRST));
    act(() => history.goForward());
    await waitFor(() => expect(store.getState().dongleId).toBe(SECOND));
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
    mocks.requests = [];
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(0);
  });
});
