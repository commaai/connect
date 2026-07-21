import { drives as Drives, raw as Raw, video as Video } from '@commaai/api';

export const DEMO_DONGLE_ID = 'demo';
const DEMO_SOURCE_DONGLE_ID = '5beb9b58bd12b691';
const DEMO_SOURCE_LOG_ID = '0000010a--a51155e496';
export const DEMO_SOURCE_ROUTE = `${DEMO_SOURCE_DONGLE_ID}|${DEMO_SOURCE_LOG_ID}`;
const AVAILABLE_SEGMENTS = Symbol('demoAvailableSegments');
const MISSING_EVENT_SEGMENTS = Symbol('demoMissingEventSegments');
const NO_GPS = Symbol('demoNoGps');

export function isDemoDongle(dongleId) {
  return dongleId === DEMO_DONGLE_ID;
}

export function isDemoPath(pathname) {
  return pathname.split('/').filter(Boolean)[0] === DEMO_DONGLE_ID;
}

const demoDevice = {
  alias: 'demo routes',
  dongle_id: DEMO_DONGLE_ID,
  is_owner: false,
  shared: true,
  prime: false,
};

const CASES = [
  { label: 'Control — complete route', logId: '0000010a--a51155e496', keep: () => true },
  { label: 'Missing first segment', logId: '0000010a--a51155e490', keep: (_, i) => i !== 0 },
  { label: 'Missing final three segments', logId: '0000010a--a51155e493', keep: (_, i, a) => i < a.length - 3 },
  { label: 'Missing events.json in first segment', logId: '0000010a--a51155e494', keep: () => true, missingEvents: segments => [segments[0]] },
  { label: 'Missing events.json in middle segment', logId: '0000010a--a51155e495', keep: () => true, missingEvents: segments => [segments[Math.floor(segments.length / 2)]] },
  { label: 'No GPS data', logId: '0000010a--a51155e497', keep: () => true, noGps: true },
];

export function createDemoRoutes(sourceRoute) {
  return CASES.map(({ label, logId, keep, missingEvents, noGps }, caseIndex) => {
    const availableSegments = sourceRoute.segment_numbers
      .filter((segment, index, segments) => keep(segment, index, segments));
    const listTimeOffset = caseIndex * 1000;
    return {
      ...sourceRoute,
      display_name: label,
      dongle_id: DEMO_DONGLE_ID,
      fullname: `${DEMO_DONGLE_ID}|${logId}`,
      log_id: logId,
      [AVAILABLE_SEGMENTS]: availableSegments,
      [MISSING_EVENT_SEGMENTS]: missingEvents ? missingEvents(sourceRoute.segment_numbers) : [],
      [NO_GPS]: Boolean(noGps),
      start_lat: noGps ? null : sourceRoute.start_lat,
      start_lng: noGps ? null : sourceRoute.start_lng,
      end_lat: noGps ? null : sourceRoute.end_lat,
      end_lng: noGps ? null : sourceRoute.end_lng,
      create_time: sourceRoute.create_time - caseIndex,
      start_time_utc_millis: sourceRoute.start_time_utc_millis - listTimeOffset,
      end_time_utc_millis: sourceRoute.end_time_utc_millis - listTimeOffset,
    };
  });
}

function getSourceRouteName(routeName) {
  return isDemoDongle(routeName.split('|')[0]) ? DEMO_SOURCE_ROUTE : routeName;
}

export function getDemoStartupData(dongleId) {
  if (!isDemoDongle(dongleId)) return null;
  return { profile: null, devices: [demoDevice] };
}

export function getRoutesSegments(dongleId, start, end, limit, routeName) {
  if (!isDemoDongle(dongleId)) {
    return Drives.getRoutesSegments(dongleId, start, end, limit, routeName);
  }
  return Drives.getRoutesSegments(
    DEMO_SOURCE_DONGLE_ID,
    undefined,
    undefined,
    undefined,
    DEMO_SOURCE_ROUTE,
  ).then((routes) => createDemoRoutes(routes[0]));
}

export function transformRouteEvents(route, segment, events) {
  return route[MISSING_EVENT_SEGMENTS]?.includes(segment) ? [] : events;
}

export function transformRouteCoords(route, coords) {
  return route[NO_GPS] ? {} : coords;
}

export async function getRouteFiles(routeName, nocache = false) {
  const sourceRouteName = getSourceRouteName(routeName);
  const files = await Raw.getRouteFiles(sourceRouteName, nocache);
  return { files, sourceRouteName };
}

export async function getRouteVideoSource(route) {
  const sourceRouteName = getSourceRouteName(route.fullname);
  const sourceUrl = Video.getQcameraStreamUrl(sourceRouteName, route.share_exp, route.share_sig);
  if (!route[AVAILABLE_SEGMENTS]) return sourceUrl;

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Unable to load demo playlist (${response.status})`);
  const playlist = rewriteDemoPlaylist(await response.text(), route[AVAILABLE_SEGMENTS]);
  return URL.createObjectURL(new Blob([playlist], { type: 'application/vnd.apple.mpegurl' }));
}

export function rewriteDemoPlaylist(playlist, availableSegments) {
  const available = new Set(availableSegments);
  return playlist.split('\n').map((line) => {
    const match = line.match(/\/(\d+)\/qcamera\.ts\?/);
    if (!match || available.has(Number(match[1]))) return line;
    // Keep the entry and duration in place, but make the media request fail.
    return line.replace(/([?&]sig=)[^&]*/, '$1intentionally-missing');
  }).join('\n');
}
