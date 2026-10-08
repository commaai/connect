import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { pause, seek } from './timeline/playback';
import { selectTimeFilter, pushTimelineRange, popTimelineRange } from './actions';

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
    if (routeStr && options.routeReplies?.[routeStr.split('|')[1]]) return options.routeReplies[routeStr.split('|')[1]];
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
  if (url.pathname.endsWith('/subscription')) return json(options.subscription || null);
  if (url.pathname.endsWith('/subscribe_info')) return json(null);
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
  test.each(['settings', 'uploads'])('cold entry opens the %s dialog over the drive', async (modal) => {
    const path = `/${FIRST}/${LOG}/0/20?modal=${modal}&device=${SECOND}`;
    const { history, store } = await renderApp(path);
    expect(await screen.findByText(modal === 'settings' ? 'Device settings' : 'Upload queue')).toBeVisible();
    expect(history.location.search).toBe(`?modal=${modal}&device=${SECOND}`);
    expect(store.getState()).toMatchObject({ dongleId: FIRST, selectedRouteId: LOG, zoom: { start: 0, end: 20000 } });
    expect(screen.queryByLabelText('Device name')?.value ?? null).toBe(modal === 'settings' ? 'Alpha' : null);
  });

  test('settings and browser history preserve drive data and paused playback', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}/0/20`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => { store.dispatch(pause()); store.dispatch(seek(5000)); });
    const before = store.getState();
    const requests = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'device settings' })[0]);
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(history.location.search).toContain('modal=settings');
    act(() => history.goBack());
    await waitFor(() => expect(screen.queryByText('Device settings')).not.toBeInTheDocument());
    act(() => history.goForward());
    expect(await screen.findByText('Device settings')).toBeVisible();
    const after = store.getState();
    for (const key of ['routes', 'currentRoute', 'zoom', 'loop', 'filter']) expect(after[key]).toBe(before[key]);
    expect(after.offset).toBe(5000);
    expect(after.desiredPlaySpeed).toBe(0);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(requests);
  });

  test('the selected device dashboard keeps its filter when its logo is clicked', async () => {
    const { store } = await renderApp(`/${FIRST}`);
    act(() => store.dispatch(selectTimeFilter(START, START + 60000)));
    await waitFor(() => expect(store.getState().routes).not.toBeNull());
    const before = store.getState();
    const requests = mocks.requests.length;
    fireEvent.click(screen.getByText('connect'));
    expect(store.getState().filter).toBe(before.filter);
    expect(store.getState().routes).toBe(before.routes);
    expect(mocks.requests).toHaveLength(requests);
  });

  test('a PUSH link fetches a drive missing from the dashboard and keeps its existing routes', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 60000 });
    expect(store.getState().routes.map((r) => r.log_id)).toEqual(expect.arrayContaining([LOG, RECENT_LOG]));
    const requests = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    act(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(requests);
  });

  test.each([[], devices])('pairing cold link survives default device selection (%j)', async (pairedDevices) => {
    const { history } = await renderApp('/?modal=pair', { devices: pairedDevices });
    expect(await screen.findByText('Pair device')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 27 });
    await waitFor(() => expect(history.location.search).toBe(''));
    act(() => history.goBack());
    expect(await screen.findByText('Pair device')).toBeVisible();
    act(() => history.goForward());
    await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
  });

  test('nested range back restores each previous selection once', async () => {
    const { store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => store.dispatch(pushTimelineRange(LOG, 10000, 50000)));
    act(() => store.dispatch(pushTimelineRange(LOG, 20000, 30000)));
    act(() => store.dispatch(popTimelineRange(LOG)));
    expect(store.getState().zoom).toMatchObject({ start: 10000, end: 50000, previous: { start: 0, end: 60000 } });
    act(() => store.dispatch(popTimelineRange(LOG)));
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 60000 });
    expect(store.getState().zoom.previous).toBeFalsy();
  });

  test('unpair confirmation follows the URL and Back returns to settings', async () => {
    const { history } = await renderApp(`/${FIRST}?modal=settings`);
    expect(await screen.findByText('Device settings')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));
    expect(await screen.findByText('Unpair device')).toBeVisible();
    expect(history.location.search).toContain('modal=unpair');
    act(() => history.goBack());
    expect(await screen.findByText('Device settings')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Unpair device')).not.toBeInTheDocument());
  });

  test('invalid URLs show a recoverable page', async () => {
    await renderApp(`/${FIRST}/${LOG}/NaN/20`);
    expect(await screen.findByText('Page not found.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Go to dashboard' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test('filter deep links close and restore without resetting dashboard data', async () => {
    const { history, store } = await renderApp(`/${FIRST}?modal=filter`);
    expect(await screen.findByText('Start date:')).toBeVisible();
    const before = store.getState();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    act(() => history.goBack());
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(store.getState().filter).toBe(before.filter);
    expect(store.getState().routes).toBe(before.routes);
  });

  test.each([
    ['prime-cancel', 'Cancel prime subscription'], ['prime-plan', 'Confirm switch'],
  ])('Prime %s cold link displays confirmation without sending a billing mutation', async (modal, text) => {
    const primeDevices = devices.map((d) => ({ ...d, prime: true }));
    const { history } = await renderApp(`/${FIRST}/prime?modal=${modal}`, {
      devices: primeDevices,
      subscription: { user_id: 'test-user', plan: 'data', next_charge_at: 1800000000 },
    });
    expect(await screen.findByText(text)).toBeVisible();
    expect(mocks.requests.filter(({ method }) => method !== 'GET')).toHaveLength(0);
    act(() => history.push(`/${FIRST}/prime`));
    await waitFor(() => expect(screen.queryByText(text)).not.toBeInTheDocument());
    act(() => history.goBack());
    expect(await screen.findByText(text)).toBeVisible();
  });

  test('a late drive lookup cannot replace a newer drive or invalidate its request', async () => {
    const otherLog = '2026-08-06--14-00-00';
    let resolveOld;
    let resolveNew;
    const oldReply = new Promise((resolve) => { resolveOld = resolve; });
    const newReply = new Promise((resolve) => { resolveNew = resolve; });
    const { history, store } = await renderApp(`/${FIRST}`, { routeReplies: { [LOG]: oldReply, [otherLog]: newReply } });
    act(() => history.push(`/${FIRST}/${LOG}`));
    act(() => history.push(`/${FIRST}/${otherLog}`));
    await act(async () => resolveOld(await json([makeRoute(FIRST, LOG)])));
    expect(store.getState().selectedRouteId).toBe(otherLog);
    expect(store.getState().currentRoute).toBeNull();
    await act(async () => resolveNew(await json([makeRoute(FIRST, otherLog)])));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().currentRoute.log_id).toBe(otherLog);
  });

  test('shared device settings deep links do not expose owner actions', async () => {
    await renderApp(`/${SHARED}?modal=settings`);
    expect(await screen.findByText('No access')).toBeVisible();
    expect(screen.queryByLabelText('Device name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument();
  });

  test('closing a cold drive fetches the dashboard instead of treating one drive as the list', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
    expect(store.getState().selectedRouteId).toBeNull();
    expect(store.getState().routesMeta.dongleId).toBe(FIRST);
  });

});
