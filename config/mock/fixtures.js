/**
 * Fixture data for the dev mock API.
 *
 * Pure functions only — no node or browser APIs — so this module can be reused
 * by a browser-side mock (MSW), by Playwright, or by a future SvelteKit port.
 * Everything is derived from a `now` timestamp passed in by the caller, so the
 * dashboard always shows recent drives without any clock freezing.
 */

const SEGMENT_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SCENARIOS = ['default', 'nodevice', 'noprime', 'body', 'anonymous'];
export const DEFAULT_SCENARIO = 'default';

export const DONGLE_ID = '1d3dc3e03047b0c7';
export const BODY_DONGLE_ID = '4a1f7c9b2e6d8035';

/** Deterministic PRNG so a given route index always produces the same drive. */
function seeded(seed) {
  let state = (seed * 1103515245 + 12345) & 0x7fffffff;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Route log ids are `[a-f0-9-]{20}`: 8 hex, a double dash, then 10 hex. */
function makeLogId(index) {
  const left = (0x0000010a + index * 3).toString(16).padStart(8, '0').slice(-8);
  const right = (0xa51155e496 + index * 7919).toString(16).padStart(10, '0').slice(-10);
  return `${left}--${right}`;
}

/** `YYYY-MM-DDTHH:mm:ss` in UTC, matching the API's naive local timestamps. */
function isoNaive(millis) {
  return new Date(millis).toISOString().replace(/\.\d+Z$/, '');
}

const PLACES = [
  { start: { place: 'San Diego', details: 'California' }, end: { place: 'La Jolla', details: 'San Diego, CA' } },
  { start: { place: 'Mountain View', details: 'California' }, end: { place: 'Palo Alto', details: 'Santa Clara County, CA' } },
  { start: { place: 'Oakland', details: 'California' }, end: { place: 'Berkeley', details: 'Alameda County, CA' } },
  { start: { place: 'Santa Monica', details: 'Los Angeles, CA' }, end: { place: 'Pasadena', details: 'Los Angeles County, CA' } },
];

export function makeProfile() {
  return {
    email: 'dev@example.com',
    id: 'mock-user',
    user_id: 'mock-user',
    superuser: false,
    points: 4210,
    regdate: 1600000000,
  };
}

export function makeDevice(scenario, now) {
  const nowSeconds = Math.floor(now / 1000);
  if (scenario === 'body') {
    return {
      alias: 'comma body',
      device_type: 'tizi',
      dongle_id: BODY_DONGLE_ID,
      commacare: false,
      eligible_features: { prime: true, prime_data: true, nav: true },
      fetched_at: nowSeconds,
      is_owner: true,
      last_athena_ping: nowSeconds,
      openpilot_version: '0.11.2',
      prime: true,
      prime_type: 1,
      rpc: { not_car: true },
      serial: 'a10bd21c',
      sim_id: '89014103211118510720',
      trial_claimed: true,
      version: '0.11.2',
    };
  }
  return {
    alias: 'Bronco Sport',
    device_type: 'tici',
    dongle_id: DONGLE_ID,
    commacare: scenario !== 'noprime',
    eligible_features: { prime: true, prime_data: true, nav: true },
    fetched_at: nowSeconds,
    is_owner: true,
    last_athena_ping: nowSeconds,
    openpilot_version: '0.10.4',
    prime: scenario !== 'noprime',
    prime_type: scenario === 'noprime' ? 0 : 1,
    rpc: { not_car: false },
    serial: 'cb421c10',
    sim_id: '89014103211118510720',
    trial_claimed: scenario !== 'noprime',
    version: '0.10.4',
  };
}

export function makeDevices(scenario, now) {
  if (scenario === 'nodevice') return [];
  return [makeDevice(scenario, now)];
}

export function activeDongleId(scenario) {
  return scenario === 'body' ? BODY_DONGLE_ID : DONGLE_ID;
}

/**
 * Build a drive. Routes march backwards from `now`, roughly two per day.
 */
export function makeRoute(scenario, now, index, origin) {
  const random = seeded(index + 1);
  const dongleId = activeDongleId(scenario);
  const segmentCount = 6 + Math.floor(random() * 14);
  const startTime = now - (Math.floor(index / 2) * DAY_MS)
    - ((index % 2) * 5 * 60 * 60 * 1000) - (2 * 60 * 60 * 1000);
  const endTime = startTime + (segmentCount * SEGMENT_MS) - Math.floor(random() * 20000);
  const segmentNumbers = Array.from({ length: segmentCount }, (_, i) => i);
  const places = PLACES[index % PLACES.length];
  const startLat = 32.7498 + (random() - 0.5) * 0.4;
  const startLng = -117.195 + (random() - 0.5) * 0.4;
  const fullname = `${dongleId}|${makeLogId(index)}`;

  return {
    car_id: 1238,
    create_time: Math.floor(startTime / 1000),
    distance: Number((segmentCount * 0.68 + random()).toFixed(4)),
    dongle_id: dongleId,
    end_lat: Number((startLat + 0.12).toFixed(6)),
    end_lng: Number((startLng + 0.02).toFixed(6)),
    endLocation: places.end,
    end_time: isoNaive(endTime),
    end_time_utc_millis: endTime,
    fullname,
    git_branch: 'master',
    git_commit: '0f4c1e2a',
    init_logmonotime: 0,
    is_preserved: index === 1,
    is_public: index === 0,
    length: Number((segmentCount * 0.68 + random()).toFixed(4)),
    make: 'ford',
    maxqcamera: segmentCount - 1,
    maxqlog: segmentCount - 1,
    passive: false,
    platform: 'FORD_BRONCO_SPORT_MK1',
    procqlog: segmentCount - 1,
    proccamera: segmentCount - 1,
    segment_end_times: segmentNumbers.map((i) => Math.min(startTime + ((i + 1) * SEGMENT_MS), endTime)),
    segment_numbers: segmentNumbers,
    segment_start_times: segmentNumbers.map((i) => startTime + (i * SEGMENT_MS)),
    share_exp: String(Math.floor((now + (30 * DAY_MS)) / 1000)),
    share_sig: 'mocksignature',
    start_lat: Number(startLat.toFixed(6)),
    start_lng: Number(startLng.toFixed(6)),
    startLocation: places.start,
    start_time: isoNaive(startTime),
    start_time_utc_millis: startTime,
    url: `${origin}/__mock/assets/${encodeURIComponent(fullname)}`,
    user_id: 'mock-user',
    version: '0.10.4',
    vin: '3FMCR9B60NRE00000',
  };
}

export function makeRoutes(scenario, now, origin, count = 12) {
  if (scenario === 'nodevice') return [];
  return Array.from({ length: count }, (_, index) => makeRoute(scenario, now, index, origin));
}

/** Find a route by its `dongleId|logId` name, or null. */
export function findRoute(scenario, now, origin, fullname) {
  return makeRoutes(scenario, now, origin, 40).find((route) => route.fullname === fullname) ?? null;
}

/**
 * Raw per-segment events, in the shape the device uploads them.
 *
 * `parseEvents` in src/actions/cached.js collapses runs of `state` events into
 * engage / overriding / alert spans, so we emit a state sample every 5s and
 * flip `enabled` in blocks to produce visible bands on the timeline.
 */
export function makeSegmentEvents(routeIndex, segmentNumber) {
  const random = seeded((routeIndex + 1) * 1000 + segmentNumber);
  const events = [];
  const base = segmentNumber * SEGMENT_MS;
  const SAMPLE_MS = 5000;

  // Each segment picks an engaged window; some segments stay fully disengaged.
  const engaged = random() > 0.25;
  const engageStart = Math.floor(random() * 3) * SAMPLE_MS;
  const engageEnd = SEGMENT_MS - Math.floor(random() * 4) * SAMPLE_MS;
  const overrideAt = engageStart + Math.floor(random() * 6) * SAMPLE_MS;
  const alertAt = random() > 0.7 ? engageStart + Math.floor(random() * 8) * SAMPLE_MS : -1;

  for (let offset = 0; offset < SEGMENT_MS; offset += SAMPLE_MS) {
    const isEngaged = engaged && offset >= engageStart && offset < engageEnd;
    const isOverriding = isEngaged && offset >= overrideAt && offset < overrideAt + SAMPLE_MS * 2;
    let alertStatus = 'normal';
    if (alertAt >= 0 && offset >= alertAt && offset < alertAt + SAMPLE_MS * 2) {
      alertStatus = random() > 0.5 ? 'critical' : 'userPrompt';
    }

    let state = 'disabled';
    if (isOverriding) state = 'overriding';
    else if (isEngaged) state = 'enabled';

    events.push({
      type: 'state',
      route_offset_millis: base + offset,
      route_offset_nanos: 0,
      data: { enabled: isEngaged, state, alertStatus },
    });
  }

  // Sprinkle a user flag so bookmarks render on the timeline.
  if (segmentNumber > 0 && random() > 0.85) {
    events.push({
      type: 'user_flag',
      route_offset_millis: base + 20000,
      route_offset_nanos: 0,
      data: {},
    });
  }

  return events;
}

export function makeDeviceStats() {
  return {
    all: { distance: 2461.4, minutes: 3814, routes: 173 },
    week: { distance: 88.2, minutes: 141, routes: 6 },
  };
}

export function makeDeviceLocation(scenario, now, origin) {
  const route = makeRoute(scenario, now, 0, origin);
  return {
    lat: route.end_lat,
    lng: route.end_lng,
    time: Math.floor(now / 1000),
    accuracy: 8.5,
    speed: 0,
    bearing: 142,
  };
}

export function makeSubscription(scenario, now) {
  if (scenario === 'noprime') return { error: 'not_found' };
  const nowSeconds = Math.floor(now / 1000);
  return {
    amount: 2400,
    cancel_at_period_end: false,
    current_period_end: nowSeconds + (86400 * 25),
    is_prime_sim: true,
    next_charge_at: nowSeconds + (86400 * 25),
    plan: 'data',
    requires_migration: false,
    status: 'active',
    subscribed_at: nowSeconds - (86400 * 190),
    trial_end: null,
    user_id: 'mock-user',
  };
}

export function makeSubscribeInfo(scenario) {
  return {
    allow_data: true,
    amount: 2400,
    device_online: true,
    eligible: true,
    is_prime_sim: true,
    sim_id: '89014103211118510720',
    sim_type: 'blue',
    sim_usable: true,
    trial_claimable: scenario === 'noprime',
    trial_end_data: null,
    trial_end_nodata: null,
  };
}

/**
 * Route file listing, keyed the same way src/actions/files.js expects.
 *
 * The URLs must contain `{dongleId}/{logId}/{segment}/{name}` — files.js
 * recovers the segment number by splitting on that `dongleId/logId` prefix.
 */
export function makeRouteFiles(route, origin) {
  if (!route) return {};
  const urlName = route.fullname.replace('|', '/');
  const segments = route.segment_numbers;
  const listing = (name) => segments.map((segment) => (
    `${origin}/__mock/files/${urlName}/${segment}/${name}`
  ));
  return {
    cameras: listing('fcamera.hevc'),
    dcameras: listing('dcamera.hevc'),
    ecameras: listing('ecamera.hevc'),
    logs: listing('rlog.bz2'),
    qcameras: listing('qcamera.ts'),
    qlogs: listing('qlog.bz2'),
  };
}
