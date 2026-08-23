// Demo backend: a pass-through wrapper around the real backend that only
// overrides what is needed for public demo access:
//   - authentication/profile: pretend to be signed in with a demo profile
//   - device listing: a single synthetic demo device
//   - route listing: synthetic routes cloned from one cached public route
//   - route files: synthetic file listings cloned from one cached public files
//     response
//   - video URLs: demo routes stream the underlying public route, except the
//     clone mutated to be missing qcamera (it has no share credentials)
// Everything else (billing, athena, ...) passes through.
export const DEMO_DONGLE_ID = 'deadbeefdeadbeef';

export const PUBLIC_ROUTE_DONGLE_ID = '5beb9b58bd12b691';
export const PUBLIC_ROUTE_LOG_ID = '0000010a--a51155e496';

const DEMO_DEVICE = {
  dongle_id: DEMO_DONGLE_ID,
  alias: 'demo device',
  device_type: 'threex',
  is_owner: false,
  prime: false,
  shared: true,
  last_athena_ping: 0,
};

const DEMO_PROFILE = {
  id: 'demo',
  email: 'demo@comma.ai',
  points: 0,
  superuser: false,
};

// One clone per test case. Each case mutates a fresh clone of the real public
// data on its way into the frontend.
const TEST_CASES = [
  { // missing date/time
    route(route) {
      delete route.start_time;
      delete route.end_time;
      delete route.start_time_utc_millis;
      delete route.end_time_utc_millis;
    },
  },
  { // missing GPS: a route without GPS has no coords (or any other files)
    route(route, logId) {
      delete route.start_lat;
      delete route.start_lng;
      delete route.end_lat;
      delete route.end_lng;
      route.url = route.url.replace(PUBLIC_ROUTE_LOG_ID, logId);
    },
    files: () => ({}),
  },
  { // missing qlog
    route(route) {
      delete route.maxqlog;
    },
    files(files) {
      delete files.qlogs;
      return files;
    },
  },
  { // missing qcamera: no share credentials, so its stream cannot resolve
    route(route) {
      delete route.share_exp;
      delete route.share_sig;
    },
    files(files) {
      delete files.qcameras;
      return files;
    },
  },
  { // missing thumbnail: files live under the route's own storage path, so
    // this route has no uploaded thumbnails (or any other files) yet
    route(route, logId) {
      route.url = route.url.replace(PUBLIC_ROUTE_LOG_ID, logId);
    },
    files: () => ({}),
  },
];

function demoRouteLogId(index) {
  return `00000000--${String(index + 1).padStart(10, '0')}`;
}

function demoRouteIndex(routeName) {
  const logId = routeName.split('|')[1];
  return TEST_CASES.findIndex((_, index) => demoRouteLogId(index) === logId);
}

export function createDemoBackend(realBackend) {
  let publicRoutePromise = null;
  let publicFilesPromise = null;

  // Fetch the existing public shared route once and cache it.
  function fetchPublicRoute() {
    if (!publicRoutePromise) {
      publicRoutePromise = realBackend.routes
        .getRoutesSegments(
          PUBLIC_ROUTE_DONGLE_ID, undefined, undefined, undefined,
          `${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`,
        )
        .then((routes) => {
          const publicRoute = routes && routes[0];
          if (!publicRoute) {
            throw new Error('Demo public route not found');
          }
          return publicRoute;
        });
    }
    return publicRoutePromise;
  }

  // Fetch the public route's file listing once and cache it.
  function fetchPublicFiles() {
    if (!publicFilesPromise) {
      publicFilesPromise = realBackend.routes
        .getRouteFiles(`${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`);
    }
    return publicFilesPromise;
  }

  // Clone the cached public route into fresh demo routes on every call, each
  // with a unique demo route ID and one mutation per test case.
  async function listDemoRoutes() {
    const publicRoute = await fetchPublicRoute();
    return TEST_CASES.map((testCase, index) => {
      const logId = demoRouteLogId(index);
      const route = structuredClone(publicRoute);
      route.dongle_id = DEMO_DONGLE_ID;
      route.fullname = `${DEMO_DONGLE_ID}|${logId}`;
      testCase.route(route, logId);
      return route;
    });
  }

  // Clone the cached public files on every call, applying the same mutation
  // as the route the files belong to.
  async function getDemoRouteFiles(routeName) {
    const index = demoRouteIndex(routeName);
    const files = structuredClone(await fetchPublicFiles());
    const { files: mutateFiles } = TEST_CASES[index];
    return mutateFiles ? mutateFiles(files) : files;
  }

  return {
    ...realBackend,
    auth: {
      ...realBackend.auth,
      isAuthenticated: () => true,
    },
    account: {
      ...realBackend.account,
      getProfile: () => Promise.resolve({ ...DEMO_PROFILE }),
    },
    devices: {
      ...realBackend.devices,
      listDevices: () => Promise.resolve([{ ...DEMO_DEVICE }]),
    },
    routes: {
      ...realBackend.routes,
      getRoutesSegments(dongleId, start, end, limit, routeStr) {
        if (dongleId === DEMO_DONGLE_ID) {
          return listDemoRoutes();
        }
        return realBackend.routes.getRoutesSegments(dongleId, start, end, limit, routeStr);
      },
      getRouteFiles(routeName, nocache, params) {
        if (typeof routeName === 'string'
          && routeName.startsWith(`${DEMO_DONGLE_ID}|`)
          && demoRouteIndex(routeName) !== -1) {
          return getDemoRouteFiles(routeName);
        }
        return realBackend.routes.getRouteFiles(routeName, nocache, params);
      },
    },
    video: {
      ...realBackend.video,
      getQcameraStreamUrl(routeStr, exp, sig) {
        // demo routes keep the public route's share credentials, so stream the
        // underlying public route; the clone missing qcamera has no credentials
        // and passes through to a URL that cannot resolve
        if (exp && sig && typeof routeStr === 'string' && routeStr.startsWith(`${DEMO_DONGLE_ID}|`)) {
          return realBackend.video.getQcameraStreamUrl(`${PUBLIC_ROUTE_DONGLE_ID}|${PUBLIC_ROUTE_LOG_ID}`, exp, sig);
        }
        return realBackend.video.getQcameraStreamUrl(routeStr, exp, sig);
      },
    },
  };
}
