/**
 * Pure request router for the dev mock API.
 *
 * Deliberately framework-agnostic: it takes a plain description of a request
 * and returns a plain description of a response, so the same table can drive a
 * Vite middleware today and a service worker or Playwright route handler later.
 *
 * Returns `null` when nothing matches, which the caller should surface loudly
 * rather than silently passing through — an unmatched call means the fixture
 * table has drifted from src/api.js.
 */

import {
  activeDongleId,
  findRoute,
  makeDevice,
  makeDeviceLocation,
  makeDeviceStats,
  makeDevices,
  makeProfile,
  makeRouteFiles,
  makeRoutes,
  makeSegmentEvents,
  makeSubscribeInfo,
  makeSubscription,
} from './fixtures.js';

const json = (value, status = 200) => ({ status, json: value });
const text = (body, contentType, status = 200) => ({ status, text: body, contentType });

const EMPTY_PLAYLIST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ENDLIST\n';

/** Route index by fullname, so events can be regenerated deterministically. */
function routeIndexOf(context, fullname) {
  const routes = makeRoutes(context.scenario, context.now, context.origin, 40);
  return routes.findIndex((route) => route.fullname === fullname);
}

function handleApi(context, method, path, query, body) {
  const { scenario, now, origin } = context;
  const dongleId = activeDongleId(scenario);

  if (path === 'v1/me') return json(makeProfile());
  if (path === 'v1/me/devices') return json(makeDevices(scenario, now));
  if (path === 'v1/me/turn') {
    return json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:turn.example.invalid:3478', username: 'mock', credential: 'mock' },
      ],
      ttl: 3600,
    });
  }

  const deviceMatch = path.match(/^v1(?:\.1)?\/devices\/([a-f0-9]{16})(?:\/(.*))?$/);
  if (deviceMatch) {
    const [, requestedDongle, rest] = deviceMatch;
    const device = makeDevice(scenario, now);
    if (requestedDongle !== dongleId) return json({ error: 'not_found' }, 404);

    if (!rest) {
      if (method === 'PATCH') return json({ ...device, ...body });
      return json(device);
    }
    if (rest === 'stats') return json(makeDeviceStats());
    if (rest === 'location') return json(makeDeviceLocation(scenario, now, origin));
    if (rest === 'athena_offline_queue') return json([]);
    if (rest === 'add_user') return json({ success: true });
    if (rest === 'unpair') return json({ success: true });
    if (rest === 'routes/preserved') {
      return json(makeRoutes(scenario, now, origin).filter((route) => route.is_preserved));
    }
    if (rest === 'routes_segments') {
      let routes = makeRoutes(scenario, now, origin);
      if (query.route_str) {
        routes = routes.filter((route) => route.fullname === query.route_str);
      } else {
        const start = Number(query.start);
        const end = Number(query.end);
        if (Number.isFinite(start) && Number.isFinite(end) && (start || end)) {
          routes = routes.filter((route) => (
            route.start_time_utc_millis <= end && route.end_time_utc_millis >= start
          ));
        }
        const limit = Number(query.limit);
        if (Number.isFinite(limit) && limit > 0) routes = routes.slice(0, limit);
      }
      return json(routes);
    }
  }

  const routeMatch = path.match(/^v1\/route\/([^/]+)(?:\/(.*))?$/);
  if (routeMatch) {
    const [, fullname, rest] = routeMatch;
    const route = findRoute(scenario, now, origin, fullname);
    if (!rest) {
      if (method === 'PATCH') return json({ ...route, ...body });
      return route ? json(route) : json({ error: 'not_found' }, 404);
    }
    if (rest === 'files') return json(makeRouteFiles(route, origin));
    if (rest === 'preserve') return json({ success: true });
    if (rest === 'qcamera.m3u8') return text(EMPTY_PLAYLIST, 'application/vnd.apple.mpegurl');
  }

  if (path === 'v2/pilotpair') {
    return json({ first_pair: true, dongle_id: dongleId });
  }
  if (path === 'v2/auth') {
    // Distinct from the seeded session token, so an oauth code exchange is
    // observable in tests rather than indistinguishable from the seed.
    return json({ access_token: 'mock-exchanged-token' });
  }

  const uploadMatch = path.match(/^v1\/([a-f0-9]{16})\/upload_urls$/);
  if (uploadMatch) {
    const paths = Array.isArray(body?.paths) ? body.paths : [];
    return json(paths.map((filePath) => ({
      url: `${origin}/__mock/upload/${encodeURIComponent(filePath)}`,
      headers: {},
    })));
  }

  // account.getProfile(dongleId) hits `v1/{dongleId}/` for a non-'me' id.
  if (/^v1\/[a-f0-9]{16}$/.test(path)) return json(makeProfile());

  return null;
}

function handleBilling(context, method, path) {
  const { scenario, now } = context;
  if (path === 'v1/prime/subscription') return json(makeSubscription(scenario, now));
  if (path === 'v1/prime/subscribe_info') return json(makeSubscribeInfo(scenario));
  if (path === 'v1/prime/cancel') return json({ success: true });
  if (path === 'v1/prime/switch_plan') return json({ success: true });
  if (path === 'v1/prime/stripe_checkout') return json({ url: 'https://checkout.stripe.com/mock' });
  if (path === 'v1/prime/stripe_portal') return json({ url: 'https://billing.stripe.com/mock' });
  if (path === 'v1/prime/stripe_session') {
    return json({ payment_status: 'paid', is_prime_sim: true });
  }
  return null;
}

function handleAthena(context, path, body) {
  const { scenario, now } = context;
  if (!/^[a-f0-9]{16}$/.test(path)) return null;

  const { method: rpcMethod, params } = body ?? {};
  const result = (value) => json({ jsonrpc: '2.0', id: body?.id ?? 0, result: value });

  switch (rpcMethod) {
    case 'getMessage':
      if (params?.service === 'peripheralState') {
        return result({ peripheralState: { voltage: 12380, current: 850, fanSpeedRpm: 1200 } });
      }
      if (params?.service === 'deviceState') {
        return result({
          deviceState: {
            batteryPercent: 100,
            freeSpacePercent: 62.5,
            memoryUsagePercent: 41,
            networkType: 3,
            thermalStatus: 0,
          },
        });
      }
      return result({});
    case 'getNetworkType':
      return result(3);
    case 'getNetworkMetered':
      return result(false);
    case 'getNotCar':
      return result(scenario === 'body');
    case 'getVersion':
      return result({
        version: scenario === 'body' ? '0.11.2' : '0.10.4',
        remote: 'origin/master',
        branch: 'master',
        commit: '0f4c1e2a',
        commit_date: String(Math.floor(now / 1000) - 86400),
      });
    case 'listUploadQueue':
      return result([]);
    case 'cancelUpload':
      return result({ success: true });
    case 'uploadFilesToUrls':
    case 'uploadFileToUrl':
      return result({ enqueued: 0, items: [] });
    case 'setRouteViewed':
      return result(true);
    case 'takeSnapshot':
      return result({ jpegBack: null, jpegFront: null });
    case 'startStream':
      // Enough to let the WebRTC manager negotiate and then time out cleanly.
      return result({ sdp: 'v=0\r\n', type: 'answer', time: Math.floor(now / 1000) });
    case 'getClipState':
      return result({ state: 'idle', progress: 0 });
    case 'createClip':
      return result({ filename: 'clip-mock.mp4', requested_at: Math.floor(now / 1000) });
    case 'deleteClip':
      return result({ success: true });
    case 'getClipChunk':
      return json({ jsonrpc: '2.0', id: body?.id ?? 0, error: { message: 'Clips are not available in mock mode' } });
    default:
      return result(true);
  }
}

function handleAssets(context, path) {
  // `{routeFullname}/{segment}/{file}`
  const match = path.match(/^([^/]+)\/(\d+)\/(events\.json|coords\.json|sprite\.jpg)$/);
  if (!match) return null;
  const [, fullname, segment, file] = match;

  if (file === 'coords.json') return json([]);
  if (file === 'sprite.jpg') return { status: 200, sprite: true };

  const index = routeIndexOf(context, decodeURIComponent(fullname));
  if (index < 0) return json([]);
  return json(makeSegmentEvents(index, Number(segment)));
}

/**
 * @param {object} request
 * @param {string} request.service   one of api | athena | billing | assets | files | upload
 * @param {string} request.method    HTTP method
 * @param {string} request.path      service-relative path, no leading or trailing slash
 * @param {object} request.query     parsed query string
 * @param {any}    request.body      parsed JSON or form body
 * @param {string} request.origin    absolute dev server origin, e.g. http://localhost:3000
 * @param {string} request.scenario
 * @param {number} request.now
 * @returns {object|null}
 */
export function handleMockRequest({
  service, method, path, query = {}, body = null, origin, scenario, now,
}) {
  const context = { scenario, now, origin };
  const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');

  switch (service) {
    case 'api':
      return handleApi(context, method, cleanPath, query, body);
    case 'billing':
      return handleBilling(context, method, cleanPath);
    case 'athena':
      return handleAthena(context, cleanPath, body);
    case 'assets':
      return handleAssets(context, cleanPath);
    case 'files':
      return text('', 'application/octet-stream');
    case 'upload':
      return json({ success: true });
    default:
      return null;
  }
}
