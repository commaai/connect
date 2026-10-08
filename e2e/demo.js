import { test as base, expect } from '@playwright/test';

export const DONGLE = 'deadbeefdeadbeef';
export const LOG = '00000000--0000000003';
const START = Date.UTC(2026, 7, 6, 12);
const PUBLIC_LOG = '0000010a--a51155e496';
const PUBLIC_DONGLE = '5beb9b58bd12b691';
const publicRoute = {
  fullname: `${PUBLIC_DONGLE}|${PUBLIC_LOG}`, dongle_id: PUBLIC_DONGLE,
  create_time: START, start_time_utc_millis: START, end_time_utc_millis: START + 120_000,
  start_time: START / 1000, end_time: START / 1000 + 120,
  segment_start_times: [START, START + 60_000],
  segment_end_times: [START + 60_000, START + 120_000], segment_numbers: [0, 1],
  maxqlog: 1, distance: 1, events: [],
  url: `https://routes.example.com/${PUBLIC_LOG}`,
};

// Exercise the real demo backend and UI; keep the public route independent of network access.
export const test = base.extend({
  owner: [false, { option: true }],
  context: async ({ context, owner }, use) => {
    const unexpected = [];
    const errors = [];
    const ownerId = 'aaaaaaaaaaaaaaaa';
    const device = { dongle_id: ownerId, alias: 'owner device', device_type: 'threex', is_owner: true, prime: true, version: '0.11.2', shared: false, last_athena_ping: 0 };
    if (owner) await context.addInitScript(() => {
      if (location.hostname === '127.0.0.1') localStorage.setItem('authorization', 'e2e-token');
    });
    context.on('page', page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        // Existing development-only diagnostics are recorded in the handoff, not new regressions.
        if (message.text().startsWith('[PostHog.js] PostHog was initialized without a token.')
            || message.text().startsWith('Warning: Material-UI: you are providing a disabled `button` child')) return;
        errors.push(message.text());
      });
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === '127.0.0.1') return route.continue();
      const json = (body) => route.fulfill({ json: body });
      if (['plausible.io', 'www.googletagmanager.com', 'fonts.googleapis.com'].includes(url.hostname)) {
        return route.fulfill({ contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript', body: '' });
      }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
      if (url.hostname === 'api.mapbox.com') {
        if (url.pathname.includes('/geocoding/')) return json({ features: [] });
        if (url.pathname.includes('/styles/')) return json({ version: 8, sources: {}, layers: [] });
        return json({});
      }
      if (url.hostname === 'routes.example.com') {
        if (url.pathname.endsWith('.json')) return json([]);
        // One transparent pixel avoids loading thumbnails from the public route.
        return route.fulfill({ contentType: 'image/png', body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1cAAAAASUVORK5CYII=', 'base64'),
        });
      }
      if (url.pathname.endsWith('.m3u8')) return route.fulfill({
        contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-ENDLIST\n',
      });
      if (owner && url.pathname === '/v1/me/') return json({ id: 'e2e', user_id: 'e2e', email: 'e2e@example.com', superuser: false });
      if (owner && url.pathname === '/v1/me/devices/') return json([device]);
      if (owner && url.pathname === '/v1/me/turn') return json({ iceServers: [] });
      if (owner && url.pathname.endsWith('/routes/preserved')) return json([]);
      if (owner && url.pathname.endsWith('/subscription')) return json({
        amount: 2400, plan: 'data', status: 'active', cancel_at_period_end: false,
        current_period_end: START / 1000 + 86400, next_charge_at: START / 1000 + 86400,
        subscribed_at: START / 1000 - 86400, user_id: 'e2e',
      });
      if (owner && url.pathname.endsWith('/subscribe_info')) return json({ allow_data: true, eligible: true });
      if (url.hostname === 'athena.comma.ai' && request.method() === 'POST') {
        const payload = request.postDataJSON();
        if (payload.method === 'getVersion') return json({ result: { commit_date: 1 } });
        if (['listUploadQueue', 'getAthenaQueue'].includes(payload.method)) return json({ result: [] });
        if (['getNetworkType', 'getNetworkMetered', 'getSimInfo'].includes(payload.method)) return json({ result: null });
        unexpected.push(`Athena ${payload.method}`);
        return json({ error: { message: 'Unsupported fixture request' } });
      }
      if (url.pathname.endsWith('/routes_segments')) return json([owner ? { ...publicRoute, dongle_id: ownerId, fullname: `${ownerId}|${LOG}` } : publicRoute]);
      if (url.pathname.endsWith('/files')) return json({ cameras: [], qcameras: [], logs: [], qlogs: [] });
      if (url.pathname.endsWith('/location')) return json({ lat: 32.71, lng: -117.16, time: START / 1000 });
      if (url.pathname.endsWith('/stats')) return json(null);
      if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
      if (url.pathname.endsWith('/athena_offline_queue')) return json([]);
      if (owner && /^\/v1\.1\/devices\/[^/]+\/$/.test(url.pathname)) return json(device);
      if (/\/v1\.1\/devices\/[^/]+\/$/.test(url.pathname)) return json({
        dongle_id: DONGLE, alias: 'demo device', device_type: 'threex', is_owner: false, prime: false,
      });
      if (url.pathname === '/v1/referrals') return json({
        code: 'DEMO123', referrals: [], cash: { available: 0, claimed: 0, pending: 0 },
      });
      unexpected.push(`${request.method()} ${url.href}`);
      return json({});
    });
    await use(context);
    expect(unexpected, 'Unexpected external requests').toEqual([]);
    expect(errors, 'Browser errors').toEqual([]);
  },
});

export { expect };
