import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import App from './App';
import { createInitialState } from './initialState';
import { createAppStore } from './store';
import { fetchFiles } from './actions/files';

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
  const url = new URL(input instanceof URL || typeof input === 'string' ? input : input.url);
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
    if (options.routeResponse) return options.routeResponse(url);
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
  if (url.pathname.endsWith('/subscription')) return json(options.subscription ?? null);
  if (url.pathname.endsWith('/switch_plan') && options.switchPlanResponse) return options.switchPlanResponse(JSON.parse(init.body));
  if (url.pathname.endsWith('/subscribe_info')) return json(null);
  if (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json')) return json([]);
  if (url.pathname.endsWith('/files') && options.fileResponse) return options.fileResponse(url);
  if (url.pathname.endsWith('/files') || url.pathname.endsWith('/preserved')) return json(url.pathname.endsWith('/files') ? {} : []);
  if (url.hostname === 'athena.comma.ai') {
    const payload = JSON.parse(init.body);
    return json({ jsonrpc: '2.0', id: 0, result: payload.method === 'listUploadQueue' ? [] : {} });
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

  test('an unknown path shows a recoverable error instead of a remembered dashboard', async () => {
    const { history } = await renderApp('/not-a-page', { selected: FIRST });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
    expect(screen.queryByText('Mock recent route start')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to drives' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('pairing opens by URL without devices and browser history restores it', async () => {
    const { history } = await renderApp('/pair', { devices: [] });
    expect(await screen.findByText('Pair device')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(history.location.pathname).toBe('/');
    fireEvent.click(screen.getAllByRole('button', { name: 'add new device' })[0]);
    expect(history.location.pathname).toBe('/pair');
    act(() => history.goBack());
    await waitFor(() => expect(screen.queryByText('Pair device')).not.toBeInTheDocument());
    act(() => history.goForward());
    expect(await screen.findByText('Pair device')).toBeVisible();
  });

  test('leaving pairing releases a camera stream that arrives after navigation', async () => {
    const stop = vi.fn();
    let resolveCamera;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]),
        getUserMedia: vi.fn(() => new Promise((resolve) => { resolveCamera = resolve; })),
      },
    });
    try {
      const { history } = await renderApp('/pair', { devices: [] });
      await waitFor(() => expect(resolveCamera).toBeTypeOf('function'));
      act(() => history.push('/'));
      await act(async () => { resolveCamera({ getTracks: () => [{ stop }] }); });
      expect(stop).toHaveBeenCalledOnce();
      expect(screen.queryByText('Pair device')).not.toBeInTheDocument();
    } finally {
      delete navigator.mediaDevices;
    }
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

  test('settings opens from a cold URL and survives Prime navigation and browser back', async () => {
    const { history, store } = await renderApp(`/${FIRST}/settings`);
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(screen.getByLabelText('Device name')).toHaveValue('Zulu');
    const routes = store.getState().routes;
    fireEvent.click(screen.getByRole('button', { name: 'Prime settings' }));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/prime`);
    act(() => history.goBack());
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(store.getState().routes).toBe(routes);
  });

  test('closing a cold drive URL loads the dashboard instead of reusing a single-drive response', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}`);
  });

  test('an uncached drive preserves dashboard membership and both views reuse their metadata', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    await screen.findByText('Mock recent route start');
    const requests = () => mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    const before = requests();
    act(() => history.push(`/${FIRST}/${LOG}/5/20`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(requests()).toBe(before + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    expect(screen.queryByText('Mock route start')).not.toBeInTheDocument();
    expect(requests()).toBe(before + 1);
    act(() => history.goBack());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState().zoom).toEqual({ start: 5000, end: 20000 });
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(requests()).toBe(before + 1);
  });

  test('changing a dashboard filter on a drive URL keeps the selected drive visible', async () => {
    const path = `/${FIRST}/${LOG}/5/20`;
    const { history, store } = await renderApp(path);
    expect(await screen.findByTestId('video-player')).toBeVisible();
    act(() => history.push(`${path}?from=1000&to=9000`));
    expect(screen.getByTestId('video-player')).toBeVisible();
    expect(store.getState().currentRoute.log_id).toBe(LOG);
    expect(store.getState().filter).toEqual({ start: 1000, end: 9000 });
    expect(store.getState().zoom).toEqual({ start: 5000, end: 20000 });
  });

  test('drive uploads opens by URL, retains playback and files, and closes to the exact drive', async () => {
    const path = `/${FIRST}/${LOG}/5.125/20.25`;
    const app = await renderApp(`${path}?dialog=uploads`);
    expect(await screen.findByText('Upload queue', { exact: true })).toBeVisible();
    await act(async () => { await app.store.dispatch(fetchFiles(`${FIRST}|${LOG}`)); });
    const files = app.store.getState().files;
    const { offset, startTime, loop } = app.store.getState();
    const requests = mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(app.history.location).toMatchObject({ pathname: path, search: '' });
    expect(app.store.getState()).toMatchObject({ offset, startTime, loop });
    expect(app.store.getState().files).toBe(files);
    act(() => app.history.goBack());
    expect(await screen.findByText('Upload queue', { exact: true })).toBeVisible();
    expect(app.store.getState().files).toBe(files);
    expect(mocks.requests.filter(({ url }) => url.includes('routes_segments'))).toHaveLength(requests);
    app.unmount();
    await renderApp(`${path}?dialog=uploads`);
    expect(await screen.findByText('Upload queue', { exact: true })).toBeVisible();
  });

  test('a drive outside an empty dashboard still renders media and loads its events', async () => {
    const options = { routeResponse: url => json(url.searchParams.has('route_str') ? [{ ...makeRoute(FIRST, LOG), events: undefined }] : []) };
    const { history } = await renderApp(`/${FIRST}`, options);
    expect(await screen.findByText('No routes found in selected time range.')).toBeVisible();
    act(() => history.push(`/${FIRST}/${LOG}`));
    expect(await screen.findByTestId('video-player')).toBeVisible();
    await waitFor(() => expect(mocks.requests.some(({ url }) => url.endsWith('/events.json'))).toBe(true));
  });

  test('a missing authenticated drive finishes loading without replacing the dashboard', async () => {
    const app = await renderApp(`/${FIRST}/2026-08-06--99-99-99`);
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
    app.unmount();
    const { history } = await renderApp(`/${FIRST}`);
    await screen.findByText('Mock recent route start');
    act(() => history.push(`/${FIRST}/2026-08-06--99-99-99`));
    expect(await screen.findByText('Route does not exist.')).toBeVisible();
    act(() => history.goBack());
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
  });

  test('upload queue URL closes to settings and browser history reopens it', async () => {
    const { history } = await renderApp(`/${FIRST}/settings/uploads`);
    expect(await screen.findByText('Upload queue')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(history.location.pathname).toBe(`/${FIRST}/settings`);
    expect(await screen.findByText('Device settings')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Device name'), { target: { value: 'Unfinished name' } });
    fireEvent.change(screen.getByLabelText('Share by email or user id'), { target: { value: 'draft@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uploads', exact: true }));
    expect(history.location.pathname).toBe(`/${FIRST}/settings/uploads`);
    act(() => history.goBack());
    expect(await screen.findByText('Device settings')).toBeVisible();
    expect(screen.getByLabelText('Device name')).toHaveValue('Unfinished name');
    expect(screen.getByLabelText('Share by email or user id')).toHaveValue('draft@example.com');
    act(() => history.goForward());
    expect(await screen.findByText('Upload queue')).toBeVisible();
    act(() => history.push(`/${SECOND}/settings`));
    expect(await screen.findByLabelText('Device name')).toHaveValue('Alpha');
    expect(screen.getByLabelText('Share by email or user id')).toHaveValue('');
  });

  test.each([
    ['settings', 'Mock recent route start'],
    ['settings/uploads', 'Mock recent route start'],
    ['settings?dialog=unpair', 'Mock recent route start'],
    ['prime?dialog=switch-plan', 'No access'],
    ['prime?dialog=cancel-prime', 'No access'],
  ])('a shared-device %s URL does not expose owner controls', async (page, heading) => {
    const { history } = await renderApp(`/${SHARED}/${page}`);
    expect(await screen.findByText(heading)).toBeVisible();
    expect(screen.queryByText('Device settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload queue')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpair' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm switch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).not.toBeInTheDocument();
    expect(`${history.location.pathname}${history.location.search}`).toBe(`/${SHARED}/${page}`);
  });

  test('unpair confirmation is addressable, preserves drafts, and never runs from navigation', async () => {
    const { history } = await renderApp(`/${FIRST}/settings?dialog=unpair`);
    expect(await screen.findByRole('heading', { name: 'Unpair device', exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    expect(history.location.search).toBe('');
    fireEvent.change(screen.getByLabelText('Device name'), { target: { value: 'Keep draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unpair', exact: true }));
    expect(history.location.search).toBe('?dialog=unpair');
    act(() => history.goBack());
    expect(await screen.findByLabelText('Device name')).toHaveValue('Keep draft');
    act(() => history.goForward());
    expect(await screen.findByRole('heading', { name: 'Unpair device', exact: true })).toBeVisible();
    expect(mocks.requests.filter(({ url }) => url.includes('/unpair'))).toEqual([]);
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
    expect(history.location.pathname).toBe(`/${FIRST}/filter`);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toBe(`/${FIRST}`);
    act(() => history.goBack());
    expect(await screen.findByText('Start date:')).toBeVisible();
    expect(mocks.requests.some(({ url }) => url.includes('routes_segments'))).toBe(true);
  });

  test('filter history replaces displayed dates when the dialog stays open', async () => {
    const path = `/${FIRST}/filter`;
    const first = `?from=${new Date(2026, 7, 2).getTime()}&to=${new Date(2026, 7, 7, 23, 59, 59, 999).getTime()}`;
    const second = `?from=${new Date(2026, 8, 3).getTime()}&to=${new Date(2026, 8, 9, 23, 59, 59, 999).getTime()}`;
    const { history } = await renderApp(`${path}${first}`);
    expect(document.querySelectorAll('input[type="date"]')[0]).toHaveValue('2026-08-02');
    act(() => history.push(`${path}${second}`));
    expect(document.querySelectorAll('input[type="date"]')[0]).toHaveValue('2026-09-03');
    expect(document.querySelectorAll('input[type="date"]')[1]).toHaveValue('2026-09-09');
    act(() => history.goBack());
    expect(document.querySelectorAll('input[type="date"]')[0]).toHaveValue('2026-08-02');
    expect(document.querySelectorAll('input[type="date"]')[1]).toHaveValue('2026-08-07');
  });

  test('saved date filters survive drive navigation, browser history, and reload', async () => {
    const app = await renderApp(`/${FIRST}`);
    await screen.findByText('Mock recent route start');
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const inputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2026-08-02' } });
    fireEvent.change(inputs[1], { target: { value: '2026-08-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    const start = new Date(2026, 7, 2).getTime();
    const end = new Date(2026, 7, 7, 23, 59, 59, 999).getTime();
    const search = `?from=${start}&to=${end}`;
    expect(app.history.location).toMatchObject({ pathname: `/${FIRST}`, search });
    expect(app.store.getState().filter).toEqual({ start, end });
    expect(mocks.requests.some(({ url }) => {
      const request = new URL(url);
      return request.searchParams.get('start') === String(start) && request.searchParams.get('end') === String(end);
    })).toBe(true);
    fireEvent.click(await screen.findByText('Mock recent route start'));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(app.history.location.search).toBe(search);
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(app.history.location).toMatchObject({ pathname: `/${FIRST}`, search });
    act(() => app.history.push(`/${FIRST}`));
    expect(app.store.getState().filter).not.toEqual({ start, end });
    act(() => app.history.goBack());
    expect(app.store.getState().filter).toEqual({ start, end });
    app.unmount();
    const reloaded = await renderApp(`/${FIRST}${search}`);
    expect(reloaded.store.getState().filter).toEqual({ start, end });
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(document.querySelectorAll('input[type="date"]')[0]).toHaveValue('2026-08-02');
    expect(document.querySelectorAll('input[type="date"]')[1]).toHaveValue('2026-08-07');
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
    await renderApp(`${pathname}?from=1000&to=9000`, { authenticated: false });
    await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalledOnce());
    const redirect = new URL(mocks.hardNavigate.mock.calls[0][0], 'https://connect.comma.ai');
    expect(redirect.searchParams.get('r')).toBe(`${pathname}?from=1000&to=9000`);
    expect([...redirect.searchParams.keys()]).toEqual(['r']);
  });

  test('signed-out navigation switches between public drive and login without a reload', async () => {
    const { history } = await renderApp(`/${FIRST}/${LOG}`, { authenticated: false });
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => history.push(`/${FIRST}/settings?from=1000&to=9000`));
    expect(await screen.findByText('Sign in with Google')).toBeVisible();
    expect(sessionStorage.getItem('redirectURL')).toBe(`/${FIRST}/settings?from=1000&to=9000`);
    act(() => history.goBack());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  });

  test('legacy timestamp URL converts after a successful lookup', async () => {
    const { history } = await renderApp(`/${FIRST}/${START}/${START + 60_000}`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(history.length).toBe(1);
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

  test.each([
    ['switch-plan', 'Switch to Lite plan', 'Switch to Lite plan', 'Cancel'],
    ['cancel-prime', 'Cancel prime subscription', 'Cancel subscription', 'Close'],
  ])('Prime %s confirmation opens by URL and history without changing billing', async (dialog, heading, button, close) => {
    const options = {
      devices: devices.map(device => ({ ...device, prime: true })),
      subscription: { user_id: 'test-user', plan: 'data', amount: 2400 },
    };
    const path = `/${FIRST}/prime?dialog=${dialog}`;
    const app = await renderApp(path, options);
    expect(await screen.findByRole('heading', { name: heading, exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: close, exact: true }));
    expect(app.history.location.search).toBe('');
    fireEvent.click(screen.getByRole('button', { name: button, exact: true }));
    expect(app.history.location.search).toBe(`?dialog=${dialog}`);
    act(() => app.history.goBack());
    await waitFor(() => expect(screen.queryByRole('heading', { name: heading, exact: true })).not.toBeInTheDocument());
    act(() => app.history.goForward());
    expect(await screen.findByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(mocks.requests.filter(({ method, url }) => method !== 'GET' && url.includes('billing.comma.ai'))).toEqual([]);
    app.unmount();
    await renderApp(path, options);
    expect(await screen.findByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(mocks.requests.filter(({ method, url }) => method !== 'GET' && url.includes('billing.comma.ai'))).toEqual([]);
  });

  test.each([['data', 'nodata', 'Lite'], ['nodata', 'data', 'Standard']])('a %s subscription switches once on confirmation and history does not repeat it', async (plan, target, name) => {
    const options = {
      devices: devices.map(device => ({ ...device, prime: true })),
      subscription: { user_id: 'test-user', plan, amount: 2400 },
      switchPlanResponse: vi.fn(() => {
        options.subscription = { ...options.subscription, plan: target };
        return json({ success: true });
      }),
    };
    const { history } = await renderApp(`/${FIRST}/prime?dialog=switch-plan`, options);
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm switch' }));
    expect(await screen.findByRole('heading', { name: `Welcome to ${name}` })).toBeVisible();
    expect(options.switchPlanResponse).toHaveBeenCalledExactlyOnceWith({ dongle_id: FIRST, plan: target, sim_id: null });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    act(() => history.goBack());
    expect(await screen.findByRole('heading', { name: `Switch to ${plan === 'data' ? 'Standard' : 'Lite'} plan` })).toBeVisible();
    expect(options.switchPlanResponse).toHaveBeenCalledTimes(1);
  });

  test('pushed URLs select the view and browser history preserves loaded device data', async () => {
    const { history, store } = await renderApp(`/${FIRST}`);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    const routes = store.getState().routes;
    const routeRequests = () => mocks.requests.filter(({ url }) => url.includes('routes_segments')).length;
    const requestsBefore = routeRequests();

    act(() => history.push(`/${FIRST}/prime`));
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    act(() => history.push(`/${FIRST}/${RECENT_LOG}/0/20`));
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(store.getState()).toMatchObject({ selectedRouteId: RECENT_LOG, zoom: { start: 0, end: 20000 } });

    act(() => history.goBack());
    expect(await screen.findByRole('heading', { name: 'comma prime' })).toBeVisible();
    act(() => history.goForward());
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}/0/20`);
    expect(store.getState().routes).toBe(routes);
    expect(routeRequests()).toBe(requestsBefore);
  });

  test('zoom navigation reuses drive files but selecting another drive clears them', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}/10/20`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    await act(async () => { await store.dispatch(fetchFiles(`${FIRST}|${LOG}`)); });
    const files = store.getState().files;
    expect(files).not.toBeNull();
    act(() => history.push(`/${FIRST}/${LOG}/0/30`));
    expect(store.getState().files).toBe(files);
    act(() => history.push(`/${FIRST}/${RECENT_LOG}/0/30`));
    expect(store.getState().files).not.toBe(files);
    await waitFor(() => expect(store.getState().currentRoute?.log_id).toBe(RECENT_LOG));
  });

  test('a new drive loads without waiting for an older request, whose late response is ignored', async () => {
    const options = {};
    const { history, store } = await renderApp(`/${FIRST}`, options);
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
    let resolveOld;
    const nextLog = '2026-08-07--14-00-00';
    options.routeResponse = (url) => url.searchParams.get('route_str') === `${FIRST}|${LOG}`
      ? new Promise((resolve) => { resolveOld = resolve; })
      : json([makeRoute(FIRST, nextLog)]);
    act(() => history.push(`/${FIRST}/${LOG}`));
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    act(() => history.push(`/${FIRST}/${nextLog}`));
    await waitFor(() => expect(store.getState().currentRoute?.fullname).toBe(`${FIRST}|${nextLog}`));
    await act(async () => { resolveOld(await json([makeRoute(FIRST, LOG)])); });
    expect(store.getState().currentRoute.fullname).toBe(`${FIRST}|${nextLog}`);
    expect(store.getState().routes.map((route) => route.log_id)).toEqual([RECENT_LOG]);
    expect(store.getState().routeCache[LOG]).toBeUndefined();
    expect(history.location.pathname).toBe(`/${FIRST}/${nextLog}`);
  });

  test('drive zoom-out returns to the whole drive after browser Back between ranges', async () => {
    const { history, store } = await renderApp(`/${FIRST}/${LOG}/5/50`);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    act(() => history.push(`/${FIRST}/${LOG}/10/20`));
    act(() => history.goBack());
    fireEvent.click(screen.getByRole('button', { name: 'View whole drive' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${LOG}`));
    expect(store.getState().zoom).toMatchObject({ start: 0, end: 60000 });
    expect(store.getState().loop).toEqual({ startTime: 0, duration: 60000 });
    act(() => history.goBack());
    expect(store.getState().zoom).toMatchObject({ start: 5000, end: 50000 });
  });

  test('late file URLs cannot repopulate files after leaving a drive', async () => {
    const options = {};
    const { history, store } = await renderApp(`/${FIRST}/${LOG}`, options);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    let resolveFiles;
    options.fileResponse = () => new Promise((resolve) => { resolveFiles = resolve; });
    let request;
    act(() => { request = store.dispatch(fetchFiles(`${FIRST}|${LOG}`, true)); });
    await waitFor(() => expect(resolveFiles).toBeTypeOf('function'));
    act(() => history.push(`/${FIRST}`));
    await act(async () => {
      resolveFiles(await json({ qcameras: [`https://files.example/${FIRST}/${LOG}/0/qcamera.ts`] }));
      await request;
    });
    expect(store.getState().files).toBeNull();
    expect(await screen.findByText('Mock recent route start')).toBeVisible();
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
    const { history, store, unmount } = await renderApp(`/${FIRST}`, { selected: FIRST });
    fireEvent.click(await screen.findByText('Mock recent route start'));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    const timeline = await screen.findByRole('slider', { name: 'Drive timeline' });
    fireEvent.pointerDown(timeline, { button: 0, clientX: 203, pageX: 203 });
    fireEvent.pointerMove(document, { clientX: 697, pageX: 697 });
    fireEvent.pointerUp(document, { button: 0, clientX: 697, pageX: 697 });
    const rangePath = `/${FIRST}/${RECENT_LOG}/12.18/41.82`;
    await waitFor(() => expect(history.location.pathname).toBe(rangePath));
    expect(store.getState().zoom).toEqual({ start: 12180, end: 41820 });
    act(() => history.goBack());
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}/${RECENT_LOG}`));
    fireEvent.click(within(document.body).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(history.location.pathname).toBe(`/${FIRST}`));
    unmount();
    const reloaded = await renderApp(rangePath);
    expect(await screen.findByRole('slider', { name: 'Drive timeline' })).toBeVisible();
    expect(reloaded.store.getState().zoom).toEqual({ start: 12180, end: 41820 });
  });
});
