import { expect, test } from '@playwright/test';

const DONGLE_ID = 'aaaaaaaaaaaaaaaa';
const LOG_ID = '2026-08-06--13-00-00';

test('authenticated app starts and renders the dashboard', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('authorization', 'e2e-access-token'));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:3000') return route.continue();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/v1/me/turn') return json(null);
    if (url.pathname === '/v1/me/') return json({ id: 'smoke-user', superuser: false });
    if (url.pathname === '/v1/me/devices/') return json([{ alias: 'Smoke device', dongle_id: DONGLE_ID, device_type: 'threex', is_owner: true, prime: false }]);
    if (url.pathname.endsWith('/routes_segments')) return json([{
      create_time: Date.now(),
      distance: 1,
      dongle_id: DONGLE_ID,
      end_time_utc_millis: Date.now(),
      events: [],
      fullname: `${DONGLE_ID}|${LOG_ID}`,
      maxqlog: 0,
      segment_end_times: [Date.now()],
      segment_numbers: [0],
      segment_start_times: [Date.now() - 60_000],
      startLocation: { place: 'Browser smoke route', details: '' },
      endLocation: { place: 'Route end', details: '' },
      start_time_utc_millis: Date.now() - 60_000,
      url: 'https://routes.example.com',
    }]);
    if (url.pathname.endsWith('/location')) return json({ error: 'no_segments_uploaded' });
    if (url.pathname.endsWith('/stats')) return json(null);
    if (url.pathname.endsWith('/subscription') || url.pathname.endsWith('/subscribe_info')) return json(null);
    if (url.hostname === 'routes.example.com' && (url.pathname.endsWith('/events.json') || url.pathname.endsWith('/coords.json'))) return json([]);
    if (url.hostname === 'routes.example.com') return route.fulfill({ status: 200, body: '' });
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await expect(page.getByText('Browser smoke route')).toBeVisible();
  await expect(page).toHaveURL(`/${DONGLE_ID}`);
});
