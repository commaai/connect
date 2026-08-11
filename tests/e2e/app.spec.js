import { expect, test } from '@playwright/test';

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

function route(dongleId, logId = RECENT_LOG) {
  const start = logId === LOG ? START : START + 3_600_000;
  return {
    create_time: start,
    distance: 1,
    dongle_id: dongleId,
    end_time_utc_millis: start + 60_000,
    events: [],
    fullname: `${dongleId}|${logId}`,
    maxqlog: 0,
    segment_end_times: [start + 60_000],
    segment_numbers: [0],
    segment_start_times: [start],
    startLocation: { place: logId === LOG ? 'Mock route start' : 'Mock recent route start', details: 'Start details' },
    endLocation: { place: 'Mock route end', details: 'End details' },
    start_time_utc_millis: start,
    url: 'https://routes.example.com',
  };
}

async function mockApplication(page, options = {}) {
  const requests = [];
  const unhandled = [];
  const deviceList = options.devices ?? devices;
  await page.addInitScript(({ authenticated, selected }) => {
    if (sessionStorage.getItem('__connectE2EInitialized')) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('__connectE2EInitialized', 'true');
    if (authenticated) localStorage.setItem('authorization', 'e2e-access-token');
    if (selected) localStorage.setItem('selectedDongleId', selected);
  }, { authenticated: options.authenticated !== false, selected: options.selected });

  await page.route('**/*', async (interception) => {
    const request = interception.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      requests.push({ method: 'OPTIONS', url: url.href });
      await interception.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      return;
    }
    if (url.origin === 'http://127.0.0.1:3000' || url.protocol === 'blob:' || url.protocol === 'data:') {
      await interception.continue();
      return;
    }
    requests.push({ method: request.method(), url: url.href, body: request.postData() });
    const json = async (body) => interception.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (url.origin === 'https://api.comma.ai') {
      if (url.pathname === '/v1/me/turn') return json(null);
      if (url.pathname === '/v1/me/') return json({ id: 'test-user', superuser: false });
      if (url.pathname === '/v1/me/devices/') return json(deviceList);
      const segments = url.pathname.match(/^\/v1\/devices\/([a-f0-9]{16})\/routes_segments$/);
      if (segments) {
        const dongleId = segments[1];
        const routeStr = url.searchParams.get('route_str');
        if (options.failedRoutes && url.searchParams.has('start')) return interception.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        if (options.emptyRoutes) return json([]);
        if (routeStr) return json(routeStr.endsWith(`|${LOG}`) || routeStr.endsWith(`|${RECENT_LOG}`) ? [route(dongleId, routeStr.split('|')[1])] : []);
        if (url.searchParams.get('start') === String(START)) return json([route(dongleId, LOG)]);
        return json(options.emptyRoutes ? [] : [route(dongleId)]);
      }
      if (/^\/v1\/devices\/[a-f0-9]{16}\/location$/.test(url.pathname)) return json({ error: 'no_segments_uploaded' });
      if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/$/.test(url.pathname)) {
        const dongleId = url.pathname.split('/')[3];
        return json({ alias: dongleId === SHARED ? 'Shared device' : 'Device', dongle_id: dongleId, device_type: 'threex', is_owner: false, prime: false });
      }
      if (/^\/v1\.1\/devices\/[a-f0-9]{16}\/stats$/.test(url.pathname)) return json(null);
      if (/^\/v1\/route\/.+\/files$/.test(url.pathname)) return json({});
      if (/^\/v1\/devices\/[a-f0-9]{16}\/routes\/preserved$/.test(url.pathname)) return json([]);
    }
    if (url.origin === 'https://billing.comma.ai' && ['/v1/prime/subscribe_info', '/v1/prime/subscription'].includes(url.pathname)) return json(null);
    if (url.origin === 'https://athena.comma.ai') return json({ jsonrpc: '2.0', id: 0, result: {} });
    if (url.origin === 'https://routes.example.com' && url.pathname.endsWith('/events.json')) return json([]);
    if (url.origin === 'https://routes.example.com' && url.pathname.endsWith('/coords.json')) return json([]);
    if (url.origin === 'https://routes.example.com') return interception.fulfill({ status: 200, body: '' });
    if (url.hostname === 'api.mapbox.com' && url.pathname.startsWith('/styles/')) {
      return json({ version: 8, sources: {}, layers: [] });
    }
    if (url.hostname === 'fonts.googleapis.com') return interception.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (['plausible.io', 'www.googletagmanager.com', 'cdn.jsdelivr.net', 'appleid.cdn-apple.com'].includes(url.hostname)) {
      return interception.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    }
    unhandled.push(`${request.method()} ${url.href}`);
    await interception.abort('blockedbyclient');
  });
  return { requests, unhandled };
}

async function assertHandled(unhandled) {
  expect(unhandled, `Unhandled application requests:\n${unhandled.join('\n')}`).toEqual([]);
}

test('root uses a valid stored device and keeps it across reload', async ({ page }) => {
  const api = await mockApplication(page, { selected: FIRST });
  await page.goto('/');
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await expect(page).toHaveURL(`/${FIRST}`);
  expect(await page.evaluate(() => localStorage.getItem('selectedDongleId'))).toBe(FIRST);
  await page.reload();
  await expect(page).toHaveURL(`/${FIRST}`);
  expect(await page.evaluate(() => localStorage.getItem('selectedDongleId'))).toBe(FIRST);
  await assertHandled(api.unhandled);
});

for (const [name, selected] of [
  ['no stored device', undefined],
  ['an unknown stored device', 'dddddddddddddddd'],
]) test(`root selects the first device with ${name}`, async ({ page }) => {
  const api = await mockApplication(page, { selected });
  await page.goto('/');
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await expect(page).toHaveURL(`/${FIRST}`);
  expect(await page.evaluate(() => localStorage.getItem('selectedDongleId'))).toBe(FIRST);
  await assertHandled(api.unhandled);
});

test('root with no devices shows pairing', async ({ page }) => {
  const api = await mockApplication(page, { devices: [] });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pair your device' })).toBeVisible();
  await expect(page).toHaveURL('/');
  await assertHandled(api.unhandled);
});

for (const [name, dongleId] of [
  ['owned', FIRST],
  ['shared', SHARED],
]) test(`direct entry opens ${name === 'owned' ? 'an owned' : 'a shared'} device dashboard`, async ({ page }) => {
  const api = await mockApplication(page);
  await page.goto(`/${dongleId}`);
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await expect(page).toHaveURL(`/${dongleId}`);
  await assertHandled(api.unhandled);
});

test('dashboard filter and empty route states remain usable', async ({ page }) => {
  const api = await mockApplication(page, { emptyRoutes: true });
  await page.goto(`/${FIRST}`);
  await expect(page.getByText('No routes found in selected time range.')).toBeVisible();
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(api.requests.some(({ url }) => url.includes('routes_segments'))).toBe(true);
  await assertHandled(api.unhandled);
});

for (const [name, pathname] of [
  ['whole drive', `/${FIRST}/${LOG}`],
  ['ranged drive', `/${FIRST}/${LOG}/10/20`],
]) test(`authenticated cold entry opens a ${name} URL`, async ({ page }) => {
  const api = await mockApplication(page);
  await page.goto(pathname);
  await expect(page.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  await expect(page).toHaveURL(pathname);
  await assertHandled(api.unhandled);
});

for (const [name, pathname] of [
  ['whole drive', `/${FIRST}/${LOG}`],
  ['ranged drive', `/${FIRST}/${LOG}/10/20`],
]) test(`signed-out cold entry opens a public ${name} URL`, async ({ page }) => {
  const api = await mockApplication(page, { authenticated: false });
  await page.goto(pathname);
  await expect(page.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  await expect(page).toHaveURL(pathname);
  await assertHandled(api.unhandled);
});

for (const [name, pathname] of [
  ['private device', `/${FIRST}`],
  ['Prime', `/${FIRST}/prime`],
  ['stream', `/${FIRST}/stream`],
]) test(`signed-out entry to ${name} retains the path on login`, async ({ page }) => {
  const api = await mockApplication(page, { authenticated: false });
  await page.goto(pathname);
  await expect(page.getByText('Sign in with Google')).toBeVisible();
  await expect(page).toHaveURL(pathname);
  await assertHandled(api.unhandled);
});

test('legacy timestamp URL converts after a successful lookup', async ({ page }) => {
  const api = await mockApplication(page);
  await page.goto(`/${FIRST}/${START}/${START + 60_000}`);
  await expect(page.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  await expect(page).toHaveURL(`/${FIRST}/${LOG}`);
  await assertHandled(api.unhandled);
});

for (const [name, options, fallback] of [
  ['empty', { emptyRoutes: true }, 'empty'],
  ['failed', { failedRoutes: true }, 'loading'],
]) test(`legacy timestamp URL remains unchanged after ${name === 'empty' ? 'an empty' : 'a failed'} lookup`, async ({ page }) => {
  const api = await mockApplication(page, options);
  const pathname = `/${FIRST}/${START}/${START + 60_000}`;
  await page.goto(pathname);
  await expect(page).toHaveURL(pathname);
  if (fallback === 'empty') {
    await expect(page.getByText('No routes found in selected time range.')).toBeVisible();
  } else {
    await expect(page.getByText('Loading...')).toBeVisible();
  }
  await assertHandled(api.unhandled);
});

test('Prime close and browser history restore its view', async ({ page }) => {
  const api = await mockApplication(page);
  await page.goto(`/${FIRST}/prime`);
  await expect(page.getByRole('heading', { name: 'comma prime' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page).toHaveURL(`/${FIRST}`);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'comma prime' })).toBeVisible();
  await page.goForward();
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await assertHandled(api.unhandled);
});

test('stream close and browser history restore its view', async ({ page }) => {
  const online = devices.map((device) => ({ ...device, commacare: true, last_athena_ping: Math.floor(Date.now() / 1000), openpilot_version: '0.11.2' }));
  const api = await mockApplication(page, { devices: online });
  await page.goto(`/${FIRST}/stream`);
  await expect(page.getByRole('button', { name: 'Close teleop' })).toBeVisible();
  await page.getByRole('button', { name: 'Close teleop' }).click();
  await expect(page).toHaveURL(`/${FIRST}`);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Close teleop' })).toBeVisible();
  await page.goForward();
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await assertHandled(api.unhandled);
});

test('device browser history restores exact dashboards', async ({ page }) => {
  const api = await mockApplication(page);
  await page.goto(`/${FIRST}`);
  await page.goto(`/${SECOND}`);
  await page.goBack();
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await expect(page).toHaveURL(`/${FIRST}`);
  await page.goForward();
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await expect(page).toHaveURL(`/${SECOND}`);
  await assertHandled(api.unhandled);
});

test('drive selection, timeline range, back, and close preserve exact URLs', async ({ page }) => {
  const api = await mockApplication(page, { selected: FIRST });
  await page.goto(`/${FIRST}`);
  await page.getByText('Mock recent route start').click();
  await expect(page).toHaveURL(`/${FIRST}/${RECENT_LOG}`);
  const timeline = page.getByRole('slider', { name: 'Drive timeline' });
  await expect(page.getByRole('slider', { name: 'Drive timeline' })).toBeVisible();
  const box = await timeline.boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`/${FIRST}/${RECENT_LOG}/\\d+/\\d+$`));
  await page.goBack();
  await expect(timeline).toBeVisible();
  await expect(page).toHaveURL(`/${FIRST}/${RECENT_LOG}`);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Mock recent route start')).toBeVisible();
  await expect(page).toHaveURL(`/${FIRST}`);
  await assertHandled(api.unhandled);
});

test('a missing public route redirects to login with the requested route', async ({ page }) => {
  const api = await mockApplication(page, { authenticated: false });
  const pathname = `/${FIRST}/2026-08-06--99-99-99`;
  await page.goto(pathname);
  await expect(page.getByText('Sign in with Google')).toBeVisible();
  await expect(page).toHaveURL(`/?r=${pathname}`);
  await assertHandled(api.unhandled);
});
