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

const AFFECTED_SEGMENT = 1;

const MISSING_DATA_CASES = [
  {
    title: 'Epoch date/time (no clock)',
    // A route recorded without a valid clock only counts time from boot, so
    // its segment times are relative to the unix epoch (no real date).
    route(route, affectedSegment) {
      const bootTime = route.segment_start_times[0];
      if (affectedSegment !== undefined) {
        route.segment_start_times[affectedSegment] -= bootTime;
        route.segment_end_times[affectedSegment] -= bootTime;
      } else {
        delete route.start_time;
        delete route.end_time;
        delete route.start_time_utc_millis;
        delete route.end_time_utc_millis;
        route.segment_start_times = route.segment_start_times.map((time) => time - bootTime);
        route.segment_end_times = route.segment_end_times.map((time) => time - bootTime);
      }
    },
  },
  {
    title: 'Missing start/end GPS',
    // Summary coordinates are route-level; per-segment coordinates are served
    // from the derived coords asset.
    missingRouteAssets: ['coords'],
    route(route, affectedSegment) {
      if (affectedSegment === undefined) {
        delete route.start_lat;
        delete route.start_lng;
        delete route.end_lat;
        delete route.end_lng;
      }
    },
  },
  {
    title: 'Missing qlog',
    missingRouteAssets: ['events', 'coords'],
    route(route, affectedSegment) {
      if (affectedSegment === undefined) {
        delete route.maxqlog;
      }
    },
    files(files, affectedSegment) {
      removeFileSegments(files, 'qlogs', affectedSegment);
      return files;
    },
  },
  {
    title: 'Missing qcamera',
    // No share credentials, so this route's stream cannot resolve.
    route(route, affectedSegment) {
      if (affectedSegment === undefined) {
        delete route.share_exp;
        delete route.share_sig;
      }
    },
    files(files, affectedSegment) {
      removeFileSegments(files, 'qcameras', affectedSegment);
      return files;
    },
  },
  {
    title: 'Missing thumbnails',
    missingThumbnails: true,
    route() {},
  },
];


const TEST_CASES = [
  {
    title: 'Public route (no issues)',
    route() {},
  },
  ...MISSING_DATA_CASES.flatMap((testCase) => [
    testCase,
    {
      ...testCase,
      title: `${testCase.title} (1 segment)`,
      affectedSegment: AFFECTED_SEGMENT,
    },
  ]),
];

function fileSegmentNumber(file) {
  const pathParts = new URL(file).pathname.split('/');
  return Number(pathParts[pathParts.length - 2]);
}

function removeFileSegments(files, type, affectedSegment) {
  if (affectedSegment === undefined) {
    delete files[type];
  } else if (Array.isArray(files[type])) {
    files[type] = files[type].filter((url) => fileSegmentNumber(url) !== affectedSegment);
  }
}

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
  // with a unique demo route ID and its test case's mutation, if any.
  async function listDemoRoutes(routeStr) {
    const publicRoute = await fetchPublicRoute();
    const routes = TEST_CASES.map((testCase, index) => {
      const logId = demoRouteLogId(index);
      const route = structuredClone(publicRoute);
      route.dongle_id = DEMO_DONGLE_ID;
      route.fullname = `${DEMO_DONGLE_ID}|${logId}`;
      route.demo_title = testCase.title;
      testCase.route(route, testCase.affectedSegment);
      return route;
    });
    return routeStr ? routes.filter((route) => route.fullname === routeStr) : routes;
  }

  // Clone the cached public files on every call, applying the same mutation
  // as the route the files belong to.
  async function getDemoRouteFiles(routeName) {
    const index = demoRouteIndex(routeName);
    const testCase = TEST_CASES[index];
    const files = structuredClone(await fetchPublicFiles());
    const { files: mutateFiles } = testCase;
    return mutateFiles ? mutateFiles(files, testCase.affectedSegment) : files;
  }

  function missingAssetUrl(route, segment, fileName) {
    const logId = route.fullname.split('|')[1];
    const missingUrl = route.url.replace(PUBLIC_ROUTE_LOG_ID, logId);
    return `${missingUrl}/${segment}/${fileName}`;
  }

  function routeAsset(type, route, segment, fileName) {
    const testCase = TEST_CASES[demoRouteIndex(route.fullname)];
    const missingForRoute = testCase && testCase.missingRouteAssets?.includes(type);
    const missingForSegment = testCase?.affectedSegment === undefined
      || testCase?.affectedSegment === segment;
    return missingForRoute && missingForSegment
      ? missingAssetUrl(route, segment, fileName)
      : realBackend.routeAssets[type](route, segment);
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
          return listDemoRoutes(routeStr);
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
    routeAssets: {
      ...realBackend.routeAssets,
      events(route, segment) {
        return routeAsset('events', route, segment, 'events.json');
      },
      coords(route, segment) {
        return routeAsset('coords', route, segment, 'coords.json');
      },
      thumbnail(route, segment) {
        const index = demoRouteIndex(route.fullname);
        const testCase = TEST_CASES[index];
        if (testCase?.missingThumbnails
          && (testCase.affectedSegment === undefined || testCase.affectedSegment === segment)) {
          return missingAssetUrl(route, segment, 'sprite.jpg');
        }
        return realBackend.routeAssets.thumbnail(route, segment);
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
