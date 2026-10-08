import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { primeNav, pushTimelineRange, selectDevice } from './actions';
import { seek } from './timeline/playback';
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
vi.mock('localforage', () => {
  const items = new Map();
  return {
    default: {
      getItem: async (key) => items.get(key) ?? null,
      setItem: async (key, value) => { items.set(key, value); return value; },
      removeItem: async (key) => { items.delete(key); },
    },
  };
});
vi.mock('./api/clips', () => ({
  deviceSupportsClips: vi.fn(async () => Boolean(mocks.options.clips)),
  clipDevice: {
    getClipState: vi.fn(async () => ({ clips: mocks.options.clips, cameras: {} })),
    hasClipBlob: vi.fn(async () => false),
    getClipUrl: vi.fn(async () => 'blob:clip'),
    createClip: vi.fn(),
    deleteClip: vi.fn(),
  },
}));

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
  mocks.requests.push({ method: init.method || 'GET', url: url.href, ...(init.body && { body: init.body }) });
  const options = mocks.options;
  const lastPing = options.online ? Math.floor(Date.now() / 1000) : undefined;
  const deviceList = (options.devices ?? devices).map((device) => ({ ...device, last_athena_ping: lastPing }));
  if (url.pathname === '/v1/me/turn') return json(null);
  if (url.pathname === '/v1/me/') return json({ id: 'test-user', superuser: Boolean(options.superuser) });
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
    if (url.searchParams.get('start') === String(START)) return json([makeRoute(dongleId, LOG)]);
    return json([makeRoute(dongleId)]);
  }
  if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
  if (url.pathname.endsWith('/stats')) return json(null);
  if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
    const dongleId = url.pathname.split('/')[3];
    return json({
      alias: options.sharedAlias ?? 'Shared device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false,
      last_athena_ping: lastPing,
    });
  }
  if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') {
    return json({ jsonrpc: '2.0', id: 0, result: JSON.parse(init.body).method === 'listUploadQueue' ? [] : {} });
  }
  throw new Error(`Unhandled request: ${init.method || 'GET'} ${url.href}`);
}

// Holds back the fetches matching `test` until release() is called.
function holdFetches(test) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const base = fetch.getMockImplementation();
  fetch.mockImplementation(async (input, init) => {
    if (test(new URL(typeof input === 'string' ? input : input.url))) await held;
    return base(input, init);
  });
  return { release, restore: () => fetch.mockImplementation(base) };
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

  test('leaving referrals from a drive shows the dashboard its URL names', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'referrals' }));
    await waitFor(() => expect(history.location.pathname).toBe('/referrals'));
    fireEvent.click(screen.getByRole('button', { name: 'referrals' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByRole('slider', { name: 'Drive timeline' })).not.toBeInTheDocument();
    expect(store.getState()).toMatchObject({ selectedRouteId: null, zoom: null });
  });

  test('legacy timestamp URL is replaced, not stacked under the drive', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(history.length).toBe(1);
  });

  test('jumping back across devices to a Prime page restores Prime', async () => {
    const { history, store } = await renderApp(`/${FIRST}/prime`);
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    act(() => { store.dispatch(selectDevice(SECOND)); });
    act(() => { store.dispatch(primeNav(true)); });
    expect(history.location.pathname).toBe(`/${SECOND}/prime`);
    act(() => history.go(-2));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/prime`));
    expect(store.getState().dongleId).toBe(FIRST);
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
  });

  test('closing a cold-loaded drive lists the device drives, not just that one', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test.each([
    ['Back', ['goBack'], '10/40', ''],
    ['Back and Forward', ['goBack', 'goForward'], '20/30', '/10/40'],
  ])('zooming out in the app after browser %s goes one zoom level out', async (_name, moves, range, zoomedOut) => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    act(() => { store.dispatch(pushTimelineRange(LOG, 10000, 40000)); });
    act(() => { store.dispatch(pushTimelineRange(LOG, 20000, 30000)); });
    moves.forEach((move) => act(() => history[move]()));
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}/${range}`);
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(history.location.pathname).toBe(`/${FIRST}/${LOG}${zoomedOut}`);
  });

  test.each([
    ['ending past the drive', '10/9999', { start: 10000, end: 60000 }],
    ['starting past the drive', '70/90', { start: 0, end: 60000 }],
    ['inside the drive', '10/20', { start: 10000, end: 20000 }],
  ])('a drive range %s is kept within the drive', async (_name, range, zoom) => {
    const { store } = await renderApp(`/${FIRST}/${LOG}/${range}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    expect(store.getState()).toMatchObject({ zoom, loop: { startTime: zoom.start, duration: zoom.end - zoom.start } });
  });

  test('a legacy lookup that returns after the user moved on does not take them back', async () => {
    const { release, restore } = holdFetches((url) => url.pathname.endsWith('routes_segments') && url.searchParams.get('start') === String(START));
    try {
      const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
      act(() => history.push(`/${SECOND}`));
      release();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(history.location.pathname).toBe(`/${SECOND}`);
    } finally {
      restore();
    }
  });

  const settingsGear = (dongleId) => screen.getAllByRole('button', { name: 'device settings' })
    .find((button) => button.closest('a').getAttribute('href') === `/${dongleId}`);
  const closeSettings = () => fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));

  test.each([
    ['a drive range', `/${FIRST}/${LOG}/10/20`, () => screen.findByRole('slider', { name: 'Drive timeline' })],
    ['Prime', `/${FIRST}/prime`, () => screen.findByRole('heading', { name: 'comma prime' })],
    ['referrals', '/referrals', () => screen.findByRole('heading', { name: /Refer a friend/ })],
  ])('device settings open over %s and close back to it', async (_name, pathname, findPage) => {
    const desktop = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1400); // device list always shown
    try {
      const { history } = await renderApp(pathname);
      await findPage();
      fireEvent.click(settingsGear(FIRST));
      expect(await screen.findByRole('button', { name: 'Unpair' })).toBeVisible();
      expect(history.location).toMatchObject({ pathname, search: '?dialog=settings' });
      closeSettings();
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument());
      expect(history.location).toMatchObject({ pathname, search: '' });
      expect(await findPage()).toBeVisible();
      // closing went Back, so Back does not open them again; Forward does
      expect(history.index).toBe(0);
      act(() => history.goForward());
      expect(await screen.findByRole('button', { name: 'Unpair' })).toBeVisible();
    } finally {
      desktop.mockRestore();
    }
  });

  test('device settings open from a pasted URL with the device name filled in', async () => {
    await renderApp(`/${FIRST}?dialog=settings`);
    expect(await screen.findByRole('button', { name: 'Unpair' })).toBeVisible();
    expect(screen.getByDisplayValue('Zulu')).toBeVisible();
  });

  test('Prime settings from device settings over Prime closes the settings', async () => {
    const { history } = await renderApp(`/${FIRST}/prime?dialog=settings`);
    fireEvent.click(await screen.findByRole('button', { name: 'Prime settings' }));
    expect(history.location).toMatchObject({ pathname: `/${FIRST}/prime`, search: '' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument());
  });

  test.each([[false, 'no'], [true, 'the']])('a shared device settings URL for a superuser %s shows %s owner controls', async (superuser) => {
    await renderApp(`/${SHARED}?dialog=settings`, { superuser });
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(Boolean(screen.queryByRole('button', { name: 'Unpair' }))).toBe(superuser);
  });

  test('device settings show the device name once its details arrive', async () => {
    const { release, restore } = holdFetches((url) => url.pathname === `/v1.1/devices/${SHARED}/`);
    try {
      await renderApp(`/${SHARED}?dialog=settings`, { superuser: true, sharedAlias: 'Real alias' });
      await screen.findByRole('button', { name: 'Unpair' });
      release();
      expect(await screen.findByDisplayValue('Real alias')).toBeVisible();
    } finally {
      restore();
    }
  });

  test('device settings keep a name being typed when the details arrive', async () => {
    const { release, restore } = holdFetches((url) => url.pathname === `/v1.1/devices/${SHARED}/`);
    try {
      const { store } = await renderApp(`/${SHARED}?dialog=settings`, { superuser: true, sharedAlias: 'Real alias' });
      await screen.findByRole('button', { name: 'Unpair' });
      fireEvent.change(screen.getByDisplayValue('Shared device'), { target: { value: 'Typed' } });
      release();
      await waitFor(() => expect(store.getState().device.alias).toBe('Real alias'));
      expect(screen.getByDisplayValue('Typed')).toBeVisible();
    } finally {
      restore();
    }
  });

  test('settings opened while a legacy link is looked up stay open on the drive', async () => {
    const { release, restore } = holdFetches((url) => url.searchParams.get('start') === String(START));
    try {
      const pathname = `/${FIRST}/${START}/${START + 60_000}`;
      const { history } = await renderApp(pathname);
      act(() => history.push(`${pathname}?dialog=settings`));
      release();
      await waitFor(() => expect(history.location).toMatchObject({ pathname: `/${FIRST}/${LOG}`, search: '?dialog=settings' }));
      expect(await screen.findByRole('button', { name: 'Unpair' })).toBeVisible();
      expect(mocks.requests.filter(({ url }) => url.includes(`start=${START}`))).toHaveLength(1);
    } finally {
      restore();
    }
  });

  test('a signed-out legacy link with no visible drive redirects to login', async () => {
    const pathname = `/${FIRST}/${START}/${START + 60_000}`;
    await renderApp(pathname, { authenticated: false, emptyRoutes: true });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledWith(`/?r=${pathname}`));
  });

  test('a drive outside the loaded list shows loading, then plays from its start', async () => {
    const { release, restore } = holdFetches((url) => url.searchParams.get('route_str') === `${FIRST}|${LOG}`);
    try {
      const { history, store } = await renderApp(`/${FIRST}/${RECENT_LOG}`);
      await screen.findByRole('slider', { name: 'Drive timeline' });
      act(() => { store.dispatch(seek(40000)); });
      act(() => history.push(`/${FIRST}/${LOG}`));
      expect(screen.getByText('Loading...')).toBeVisible();
      expect(screen.queryByText('Route does not exist.')).not.toBeInTheDocument();
      release();
      expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
      expect(store.getState().offset).toBe(0);
    } finally {
      restore();
    }
  });

  test('browser Back to a closed linked drive loads it again', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    act(() => history.goBack());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(screen.queryByText('Route does not exist.')).not.toBeInTheDocument();
  });

  describe('dialogs', () => {
    const routeRequests = () => mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    const CLIP = {
      filename: 'a.mp4', status: 'ready', route: `${LOG}`, camera: 'fcamera.hevc',
      source_start_time: 0, source_end_time: 10, speedup: 1, requested_at: 1, size: 1000,
    };

    beforeAll(() => {
      URL.revokeObjectURL = vi.fn();
    });

    test('add device opens one scanner, and Back closes it and releases the camera', async () => {
      const track = { stop: vi.fn() };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]),
          getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })),
        },
      });
      const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
      const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => vi.fn() }));
      try {
        const { history } = await renderApp('/', { devices: [] });
        fireEvent.click((await screen.findAllByRole('button', { name: 'add new device' }))[0]);
        expect(history.location.search).toBe('?dialog=add-device');
        expect(await screen.findAllByText('Pair device')).toHaveLength(1);
        await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1));
        act(() => history.goBack());
        await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
        await waitFor(() => expect(track.stop).toHaveBeenCalled());
      } finally {
        play.mockRestore();
        canvas.mockRestore();
        delete navigator.mediaDevices;
      }
    });

    test('a pairing link at the root is not kept in the dashboard URL', async () => {
      const { history } = await renderApp('/?pair=not-a-token&dialog=add-device');
      await waitFor(() => expect(history.location).toMatchObject({ pathname: `/${FIRST}`, search: '?dialog=add-device' }));
    });

    test('a pairing link pairs first, and the scanner opens after it', async () => {
      await renderApp('/?pair=not-a-token&dialog=add-device', { devices: [] });
      expect(await screen.findByText('Pairing device')).toBeVisible();
      expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(await screen.findByText('Pair device')).toBeVisible();
    });

    test('a signed-out visitor to a public drive gets no scanner', async () => {
      await renderApp(`/${FIRST}/${LOG}?dialog=add-device`, { authenticated: false });
      await screen.findByRole('slider', { name: 'Drive timeline' });
      expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    });

    test('the upload queue opens from settings and closes back to them', async () => {
      const desktop = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1400);
      try {
        const { history } = await renderApp(`/${FIRST}`);
        await screen.findByText('Mock recent route start');
        fireEvent.click(screen.getAllByRole('button', { name: 'device settings' })[0]);
        fireEvent.click(await screen.findByRole('button', { name: 'Uploads' }));
        expect(history.location.search).toBe('?dialog=uploads');
        expect(await screen.findByText('Upload queue')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));
        expect(await screen.findByRole('button', { name: 'Unpair' })).toBeVisible();
        expect(history.location.search).toBe('?dialog=settings');
      } finally {
        desktop.mockRestore();
      }
    });

    test('a linked upload queue opens once over a drive and closes in place', async () => {
      const { history } = await renderApp(`/${FIRST}/${LOG}?dialog=uploads`);
      expect(await screen.findAllByText('Upload queue')).toHaveLength(1);
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));
      await waitFor(() => expect(screen.queryByText('Upload queue')).not.toBeInTheDocument());
      expect(history.location).toMatchObject({ pathname: `/${FIRST}/${LOG}`, search: '' });
      expect(history.length).toBe(1);
    });

    test('the drive filter opens from its URL on the dashboard and keeps the loaded drives', async () => {
      const { history, store } = await renderApp(`/${FIRST}`);
      await screen.findByText('Mock recent route start');
      const { routes } = store.getState();
      const requests = routeRequests();
      fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
      expect(history.location.search).toBe('?dialog=filter');
      expect(await screen.findByText('Start date:')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByText('Start date:')).not.toBeInTheDocument());
      expect(history.location.search).toBe('');
      expect(store.getState().routes).toBe(routes);
      expect(routeRequests()).toBe(requests);
    });

    test('a dialog for another page is not shown', async () => {
      await renderApp(`/${FIRST}/${LOG}?dialog=filter`);
      await screen.findByRole('slider', { name: 'Drive timeline' });
      expect(screen.queryByText('Start date:')).not.toBeInTheDocument();
    });

    test('a dialog over a millisecond drive range keeps the zoom, loop and position', async () => {
      const { history, store } = await renderApp(`/${FIRST}/${LOG}/10.5/20.25`);
      await screen.findByRole('slider', { name: 'Drive timeline' });
      act(() => { store.dispatch(seek(15000)); });
      const { zoom, loop, offset } = store.getState();
      expect(zoom).toMatchObject({ start: 10500, end: 20250 });
      const requests = routeRequests();
      act(() => history.push(`/${FIRST}/${LOG}/10.5/20.25?dialog=uploads`));
      expect(await screen.findByText('Upload queue')).toBeVisible();
      act(() => history.goBack());
      expect(store.getState()).toMatchObject({ zoom, loop, offset });
      expect(store.getState().zoom).toBe(zoom);
      expect(routeRequests()).toBe(requests);
    });

    test('a linked clip plays over the clips menu, and closes to the menu', async () => {
      const { history } = await renderApp(`/${FIRST}/${LOG}?dialog=clips&clip=a.mp4`, { online: true, clips: [CLIP] });
      expect(await screen.findByText('Create a clip')).toBeVisible();
      const viewerGone = () => expect(screen.queryByRole('button', { name: 'Close video', hidden: true })).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Close video' }));
      await waitFor(viewerGone);
      expect(history.location.search).toBe('?dialog=clips');
      expect(history.length).toBe(1);
      // MUI leaves the menu aria-hidden after a dialog over it closes, as on master
      fireEvent.click(screen.getByRole('button', { name: 'Play clip', hidden: true }));
      expect(history.location.search).toBe('?dialog=clips&clip=a.mp4');
      expect(await screen.findByRole('button', { name: 'Close video' })).toBeVisible();
      act(() => history.goBack());
      await waitFor(viewerGone);
      expect(screen.getByText('Create a clip')).toBeVisible();
    });

    test('switching clips does not stack them, and closing the menu from a clip returns to the drive', async () => {
      const { clipDevice } = await import('./api/clips');
      clipDevice.getClipUrl.mockImplementation(() => new Promise(() => {})); // downloads still running
      try {
        const clips = [CLIP, { ...CLIP, filename: 'b.mp4' }];
        const { history } = await renderApp(`/${FIRST}/${LOG}`, { online: true, clips });
        fireEvent.click(await screen.findByText('Clip'));
        const [first, second] = await screen.findAllByRole('button', { name: 'Download clip' });
        fireEvent.click(first);
        expect(history.location.search).toBe('?dialog=clips&clip=a.mp4');
        fireEvent.click(second);
        expect(history.location.search).toBe('?dialog=clips&clip=b.mp4');
        expect(history.length).toBe(3);
        fireEvent.keyDown(document.body, { key: 'Escape', keyCode: 27 }); // closes the menu
        await waitFor(() => expect(history.location).toMatchObject({ pathname: `/${FIRST}/${LOG}`, search: '' }));
        expect(history.index).toBe(0);
      } finally {
        clipDevice.getClipUrl.mockImplementation(async () => 'blob:clip');
      }
    });

    test('a link to a clip the device does not list opens just the clips menu', async () => {
      const { history } = await renderApp(`/${FIRST}?dialog=clips&clip=gone.mp4`, { online: true, clips: [CLIP] });
      expect(await screen.findByText('CLIPS ON THIS DEVICE')).toBeVisible();
      await waitFor(() => expect(history.location.search).toBe('?dialog=clips'));
    });

    const button = (name) => () => screen.findByRole('button', { name });
    test.each([
      [`/${FIRST}?dialog=settings`, button('Unpair')],
      [`/${FIRST}/prime?dialog=settings`, button('Unpair')],
      [`/${FIRST}?dialog=uploads`, button('Cancel All')],
      [`/${FIRST}/${LOG}?dialog=clips&clip=a.mp4`, button('Close video')],
      [`/${FIRST}?dialog=filter`, button('Save')],
      ['/?dialog=add-device', () => screen.findByText('Pair device')],
    ])('%s only opens UI', async (pathname, findDialog) => {
      const { clipDevice } = await import('./api/clips');
      await renderApp(pathname, { online: true, clips: [CLIP] });
      expect(await findDialog()).toBeInTheDocument();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      const reads = ['getMessage', 'getNetworkMetered', 'getNetworkType', 'getNotCar', 'listUploadQueue'];
      const changes = mocks.requests.filter(({ method, body }) => method !== 'GET' && !reads.includes(JSON.parse(body).method));
      expect(changes).toEqual([]);
      expect(clipDevice.createClip).not.toHaveBeenCalled();
      expect(clipDevice.deleteClip).not.toHaveBeenCalled();
    });
  });
});
