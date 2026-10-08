import React from 'react';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { pushTimelineRange, selectDevice, selectTimeFilter } from './actions';
import { closeOverlay } from './actions/history';
import { play } from './timeline/playback';

// These tests render the whole app (lazy chunks, maps, video stubs) and are
// much heavier than the rest of the suite. Give them headroom so a fully
// parallel run on a busy machine can't starve them into timeouts.
configure({ asyncUtilTimeout: 8000 });
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

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
const UNKNOWN = 'dddddddddddddddd';
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
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    if (options.unknownDevices?.includes(dongleId)) return json({ error: 'unknown device' }, 404);
    return json({ alias: 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
  }
  if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') {
    const method = typeof init.body === 'string' ? JSON.parse(init.body)?.method : undefined;
    // listUploadQueue's result is an array of uploads; other calls are ignored.
    return json({ jsonrpc: '2.0', id: 0, result: method === 'listUploadQueue' ? [] : {} });
  }  throw new Error(`Unhandled request: ${init.method || 'GET'} ${url.href}`);
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
    { timeout: 10000 },
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

  describe('url as the single navigation authority', () => {
    test('a programmatic push is reconciled even when no action changed state', async () => {
      const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
      expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();

      // A react-router push (e.g. the drawer's home link) must drive the store.
      act(() => history.push('/'));
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
      expect(store.getState().selectedRouteId).toBeNull();
      expect(store.getState().currentRoute).toBeNull();
      expect(store.getState().zoom).toBeNull();
      expect(await screen.findByText('Mock recent route start')).toBeVisible();
    });

    test('closing a deep-linked drive reloads the full route list', async () => {
      const { history } = await renderApp(`/${FIRST}/${LOG}`);
      await screen.findByRole('slider', { name: 'Drive timeline' });

      fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
      // The drive had loaded only its own route; the dashboard list must refresh.
      expect(await screen.findByText('Mock recent route start')).toBeVisible();
    });

    test('re-selecting the current device reuses state and does not refetch', async () => {
      const { store } = await renderApp(`/${FIRST}`);
      await screen.findByText('Mock recent route start');

      act(() => store.dispatch(selectTimeFilter(START - 86_400_000, START)));
      const filter = store.getState().filter;
      const requests = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;

      act(() => store.dispatch(selectDevice(FIRST)));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

      expect(store.getState().filter).toEqual(filter);
      expect(mocks.requests.filter(({ url }) => url.includes('routes_segments')).length).toBe(requests);
    });

    test('changing the timeline range keeps the playback speed', async () => {
      const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
      await screen.findByRole('slider', { name: 'Drive timeline' });
      act(() => { store.dispatch(play(4)); });
      expect(store.getState().desiredPlaySpeed).toBe(4);

      act(() => { store.dispatch(pushTimelineRange(LOG, 10_000, 20_000)); });
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/10/20`));
      expect(store.getState().desiredPlaySpeed).toBe(4);
    });

    test.each([
      ['a non-numeric range', `/${FIRST}/${LOG}/abc/def`],
      ['a non-numeric legacy range', `/${FIRST}/notanumber/5`],
    ])('%s never queries the API and renders 404', async (_name, pathname) => {
      const { history, store } = await renderApp(pathname);
      expect(await screen.findByText('Page not found')).toBeVisible();
      expect(history.location.pathname).toBe(pathname);
      expect(store.getState().zoom).toBeNull();
      expect(Number.isNaN(store.getState().zoom?.start)).toBe(false);
      expect(mocks.requests.some(({ url }) => url.includes('NaN'))).toBe(false);
      expect(mocks.requests.some(({ url }) => url.includes('routes_segments'))).toBe(false);
    });

    test('an unknown path renders 404 instead of a silently selected device', async () => {
      const { history, store } = await renderApp('/nonsense');
      expect(await screen.findByText('Page not found')).toBeVisible();
      expect(history.location.pathname).toBe('/nonsense');
      // The not-found page keeps the previously selected device cached.
      expect(store.getState().dongleId).toBeNull();
    });

    test('a legacy timestamp link is replaced, not pushed onto history', async () => {
      const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
      await screen.findByRole('slider', { name: 'Drive timeline' });
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
      // Replaced (not pushed): the legacy URL is gone from history.
      expect(history.length).toBe(1);
    });

    test('device settings is a URL-addressable overlay that Back closes', async () => {
      const { history } = await renderApp(`/${FIRST}`);
      await screen.findByText('Mock recent route start');

      fireEvent.click(screen.getByRole('button', { name: 'menu' }));
      // The drawer lists devices alphabetically, so Alpha/Second is first.
      fireEvent.click((await screen.findAllByRole('button', { name: 'device settings' }))[0]);
      await waitFor(() => expect(history.location.search).toBe(`?settings=${SECOND}`));
      expect(await screen.findByText('Device settings')).toBeVisible();

      act(() => history.goBack());
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
      await waitFor(() => expect(screen.queryByText('Device settings')).not.toBeInTheDocument());
    });

    test('settings for another device overlay the drive without disturbing it', async () => {
      const { history, store } = await renderApp(`/${FIRST}/${LOG}`, { selected: FIRST });
      await screen.findByRole('slider', { name: 'Drive timeline' });

      fireEvent.click(screen.getByRole('button', { name: 'menu' }));
      fireEvent.click((await screen.findAllByRole('button', { name: 'device settings' }))[0]);
      await waitFor(() => expect(history.location.search).toBe(`?settings=${SECOND}`));
      expect(await screen.findByText('Device settings')).toBeVisible();

      // The underlying drive is untouched: same path, same route, still
      // rendered (the open modal hides it from the accessibility tree, so
      // query the DOM directly).
      expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
      expect(store.getState().selectedRouteId).toBe(LOG);
      expect(document.querySelector('[aria-label="Drive timeline"]')).not.toBeNull();

      act(() => history.goBack());
      await waitFor(() => expect(history.location.search).toBe(''));
      await waitFor(() => expect(screen.queryByText('Device settings')).not.toBeInTheDocument());
      // The drive underneath was never disturbed (role queries stay hidden by
      // the closed modal's leaked aria-hidden under jsdom, so query the DOM).
      expect(document.querySelector('[aria-label="Drive timeline"]')).not.toBeNull();
    });

    test('a non-owner cannot open a shared device\'s settings by URL', async () => {
      const { history } = await renderApp(`/${SHARED}`);
      await screen.findByText('Shared device');
      act(() => history.push(`/${SHARED}?settings=${SHARED}`));
      await waitFor(() => expect(history.location.search).toBe(`?settings=${SHARED}`));
      expect(await screen.findByText('Only the device owner can manage these settings.')).toBeVisible();
      // Management controls never rendered.
      expect(screen.queryByText('Unpair')).not.toBeInTheDocument();
    });

    test('settings for a device outside the account are denied once devices load', async () => {
      const { history } = await renderApp(`/${FIRST}`, { selected: FIRST });
      await screen.findByText('Mock recent route start');
      act(() => history.push(`/${FIRST}?settings=dddddddddddddddd`));
      expect(await screen.findByText('Device not found.')).toBeVisible();
      expect(screen.queryByText('Unpair')).not.toBeInTheDocument();
    });

    test.each([
      ['a safe target', `/?r=${encodeURIComponent(`/${SECOND}`)}`, `/${SECOND}`],
      ['an unsafe target', '/?r=//evil.example/foo', `/${FIRST}`],
    ])('validates %s in ?r=', async (_name, entry, expected) => {
      const { history } = await renderApp(entry);
      await waitFor(() => expect(history.location.pathname).toBe(expected));
    });

    test('the login redirect target is sanitized before it is stored', async () => {
      await renderApp('/?r=//evil.example/foo', { authenticated: false });
      expect(await screen.findByText('Sign in with Google')).toBeVisible();
      expect(sessionStorage.getItem('redirectURL')).toBe('/');
    });
  });

  describe('stale and failed navigations', () => {
    test('an unknown device from a drive shows not-found and clears the drive view', async () => {
      const { history, store } = await renderApp(`/${FIRST}/${RECENT_LOG}`, { selected: FIRST, unknownDevices: [UNKNOWN] });
      await screen.findByRole('slider', { name: 'Drive timeline' });

      act(() => history.push(`/${UNKNOWN}`));
      // The rendered screen, not just the store, follows the URL.
      expect(await screen.findByText('Page not found')).toBeVisible();
      expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
      expect(history.location.pathname).toBe(`/${UNKNOWN}`);
      expect(store.getState().selectedRouteId).toBeNull();
      expect(store.getState().zoom).toBeNull();
      expect(store.getState().deviceNotFound).toBe(true);

      // Navigating to a valid destination recovers normally.
      act(() => history.push(`/${FIRST}`));
      expect(await screen.findByText('Mock recent route start')).toBeVisible();
      expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
    });

    test('an unknown device from a stream closes the teleop view', async () => {
      const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
      const { history, store } = await renderApp(`/${FIRST}/stream`, { devices: online, unknownDevices: [UNKNOWN] });
      expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();

      act(() => history.push(`/${UNKNOWN}`));
      expect(await screen.findByText('Page not found')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Close teleop' })).not.toBeInTheDocument();
      expect(store.getState().streamNav).toBe(false);
    });

    test('a delayed unknown-device failure after navigating on never wins', async () => {
      let resolveLookup;
      const realFetch = globalThis.fetch;
      vi.stubGlobal('fetch', vi.fn(async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url);
        if (url.pathname === `/v1.1/devices/${UNKNOWN}/`) {
          await new Promise((resolve) => { resolveLookup = resolve; });
          return json({ error: 'unknown device' }, 404);
        }
        return realFetch(input, init);
      }));
      const { history, store } = await renderApp(`/${FIRST}`, { selected: FIRST, unknownDevices: [UNKNOWN] });
      await screen.findByText('Mock recent route start');

      act(() => history.push(`/${UNKNOWN}`));
      act(() => history.push(`/${SECOND}`));
      await waitFor(() => expect(history.location.pathname).toBe(`/${SECOND}`));
      resolveLookup();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

      // The stale 404 must not turn B's dashboard into a not-found page.
      expect(await screen.findByText('Mock recent route start')).toBeVisible();
      expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
      expect(store.getState().dongleId).toBe(SECOND);
      expect(store.getState().deviceNotFound).toBe(false);
      vi.stubGlobal('fetch', realFetch);
    });
  });

  describe('url dialogs and history', () => {
    test('referrals closes the previous view and Back restores it', async () => {
      const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
      const { history } = await renderApp(`/${FIRST}/stream`, { devices: online });
      expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();

      act(() => history.push('/referrals'));
      expect(await screen.findByRole('heading', { name: /Refer a friend/ })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Close teleop' })).not.toBeInTheDocument();

      act(() => history.goBack());
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/stream`));
      expect(await screen.findByRole('button', { name: 'Close teleop' })).toBeVisible();
    });

    test('the date filter is a URL overlay that Back closes', async () => {
      const { history } = await renderApp(`/${FIRST}`, { selected: FIRST });
      await screen.findByText('Mock recent route start');

      fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
      await waitFor(() => expect(history.location.search).toBe('?dates=1'));
      expect(await screen.findByText('Start date:')).toBeVisible();

      act(() => history.goBack());
      await waitFor(() => expect(screen.queryByText('Start date:')).not.toBeInTheDocument());
      expect(history.location.search).toBe('');
    });

    test('a cold dates overlay on a drive does not render the filter', async () => {
      const { history } = await renderApp(`/${FIRST}/${LOG}?dates=1`);
      await screen.findByRole('slider', { name: 'Drive timeline' });
      // The filter's Save would destroy the drive view while the URL keeps
      // pointing at it, so it only exists on dashboards.
      expect(screen.queryByText('Start date:')).not.toBeInTheDocument();
      expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`);
    });

    test('a sub-second selection serializes to a URL that still parses', async () => {
      const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
      await screen.findByRole('slider', { name: 'Drive timeline' });

      act(() => { store.dispatch(pushTimelineRange(LOG, 10_200, 10_700)); });
      await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/10/11`));
      expect(store.getState().zoom).toEqual({ start: 10_000, end: 11_000 });
      expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    });

    test('a settings overlay renders over the stream view from a cold URL', async () => {
      const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
      const { history, store } = await renderApp(`/${FIRST}/stream?settings=${FIRST}`, { devices: online });
      // The dialog is present and the underlying teleop view stays mounted.
      expect(await screen.findByText('Device settings')).toBeVisible();
      expect(store.getState().streamNav).toBe(true);
      expect(screen.getByRole('button', { name: 'Close teleop', hidden: true })).toBeInTheDocument();

      // Closing the dialog leaves the stream view exactly as it was.
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByText('Device settings')).not.toBeInTheDocument());
      expect(history.location.search).toBe('');
      expect(history.location.pathname).toBe(`/${FIRST}/stream`);
      expect(store.getState().streamNav).toBe(true);

      // A fresh navigation to the overlay URL reopens it over the stream.
      act(() => history.push(`/${FIRST}/stream?settings=${FIRST}`));
      expect(await screen.findByText('Device settings')).toBeVisible();
    });

    test('the upload queue is a URL overlay naming its device', async () => {
      const { history, store } = await renderApp(`/${FIRST}?uploads=${FIRST}`, { selected: FIRST });
      expect(await screen.findByText('Upload queue')).toBeVisible();
      expect(screen.getByText(FIRST)).toBeVisible();

      // A cold-loaded overlay closes in place, leaving no dead history entry.
      act(() => { store.dispatch(closeOverlay()); });
      await waitFor(() => expect(screen.queryByText('Upload queue')).not.toBeInTheDocument());
      expect(history.location.search).toBe('');

      act(() => history.push(`/${FIRST}?uploads=${FIRST}`));
      expect(await screen.findByText('Upload queue')).toBeVisible();
    });

    test('the settings dialog routes its Uploads button through the URL', async () => {
      const { history } = await renderApp(`/${FIRST}?settings=${FIRST}`, { selected: FIRST });
      await screen.findByText('Device settings');

      fireEvent.click(screen.getByRole('button', { name: 'Uploads' }));
      await waitFor(() => expect(history.location.search).toBe(`?uploads=${FIRST}`));
      expect(await screen.findByText('Upload queue')).toBeVisible();
      expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    });

    test('a cold settings URL shows the device alias once the device loads', async () => {
      renderApp(`/${FIRST}?settings=${FIRST}`, { selected: FIRST });
      const aliasInput = await screen.findByLabelText('Device name');
      await waitFor(() => expect(aliasInput).toHaveValue('Zulu'));
    });
  });
});
