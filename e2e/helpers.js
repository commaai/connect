// Boots the app into a drive view without the real backend.
//
// The refactor is about the <video> element and redux, so these stubs only
// provide the auth/profile/route scaffolding the app needs to render a drive.
// The HLS stream itself is real (see fixtures/).

const DONGLE_ID = '5beb9b58bd12b691';
const ROUTE_ID = '0000010a--a51155e496';

// a route whose video starts 10s in, so videoStartOffset is exercised too
const ROUTE = {
  fullname: `${DONGLE_ID}|${ROUTE_ID}`,
  log_id: ROUTE_ID,
  dongle_id: DONGLE_ID,
  url: `${DONGLE_ID}/${ROUTE_ID}`,
  duration: 60_000,
  start_time_utc_millis: 1_600_000_000_000,
  end_time_utc_millis: 1_600_000_060_000,
  segment_numbers: [0],
  segment_start_times: [1_600_000_000_000],
  segment_end_times: [1_600_000_060_000],
  videoStartOffset: 10_000,
  max_qcamera_offset: 50_000,
  create_time: 1_600_000_000,
  is_public: true,
  events: [],
};

export async function bootstrapToDrive(page, { start = 0, end = 60 } = {}) {
  const isPublicRoute = page.url().includes(ROUTE_ID);

  await page.route('**/v1/me/', (route) => route.fulfill({
    json: {
      id: 1,
      dongle_id: DONGLE_ID,
      alias: 'test device',
      prime: false,
      superuser: false,
      username: 'tester',
    },
  }));

  await page.route('**/v1/me/devices/', (route) => route.fulfill({
    json: [{
      dongle_id: DONGLE_ID,
      alias: 'test device',
      device_type: 'threex',
      is_owner: true,
      shared: false,
      last_athena_ping: Math.floor(Date.now() / 1000),
      fetched_at: Math.floor(Date.now() / 1000),
      openpilot_version: '0.9.7',
      network_metered: false,
    }],
  }));

  await page.route('**/routes_segments*', (route) => route.fulfill({ json: [ROUTE] }));

  // prime subscription probe: nothing
  await page.route('**/v1/prime/**', (route) => route.fulfill({ json: {} }));

  await page.goto(`/${DONGLE_ID}/${ROUTE_ID}/${start}/${end}`);

  // wait for the drive view to be interactive
  await page.getByRole('slider', { name: 'Drive timeline' }).waitFor({ timeout: 20_000 });
}

export { ROUTE, DONGLE_ID, ROUTE_ID };
