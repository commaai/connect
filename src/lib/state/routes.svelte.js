import { reverseLookup } from '../utils/geocode';
import {
  USE_LOCAL_COORDS_DATA,
  USE_LOCAL_EVENTS_DATA,
  cacheExpiry,
  fetchRouteDriveCoords,
  fetchRouteEvents,
  getCacheItem,
  getVideoStartOffset,
  roundCoord,
  setCacheItem,
} from './routes-fetch';

/**
 * Per-route data that used to be merged into the redux routes/currentRoute objects.
 * Keyed by route fullname so it survives the routes list being refetched.
 */
const routeData = $state({
  events: {}, // fullname -> { events, videoStartOffset }
  locations: {}, // fullname -> { startLocation, endLocation }
  driveCoords: {}, // fullname -> { [monotonic time]: [lng, lat] }
});

const eventsRequests = {};
const coordsRequests = {};
const driveCoordsRequests = {};

export function getRouteEvents(fullname) {
  return routeData.events[fullname]?.events;
}

export function getRouteVideoStartOffset(fullname) {
  return routeData.events[fullname]?.videoStartOffset ?? null;
}

export function getRouteLocations(fullname) {
  return routeData.locations[fullname];
}

export function getRouteDriveCoords(fullname) {
  return routeData.driveCoords[fullname];
}

/** Route metadata with the fetched data merged in, matching the old redux route shape. */
export function withRouteData(route) {
  if (!route) {
    return route;
  }
  const events = routeData.events[route.fullname];
  const driveCoords = routeData.driveCoords[route.fullname];
  return {
    ...route,
    ...routeData.locations[route.fullname],
    ...(events ? { events: events.events, videoStartOffset: events.videoStartOffset } : {}),
    ...(driveCoords ? { driveCoords } : {}),
  };
}

function setEvents(fullname, events) {
  routeData.events[fullname] = { events, videoStartOffset: getVideoStartOffset(events) };
}

function setLocation(fullname, locationKey, location) {
  routeData.locations[fullname] = { ...routeData.locations[fullname], [locationKey]: location };
}

export async function fetchEvents(route) {
  if (!route) {
    return;
  }
  const { fullname } = route;

  // loaded?
  if (routeData.events[fullname]) {
    return;
  }

  // already requesting
  if (eventsRequests[fullname] !== undefined) {
    const driveEvents = await eventsRequests[fullname];
    if (driveEvents) {
      setEvents(fullname, driveEvents);
    }
    return;
  }

  let resolveEvents;
  eventsRequests[fullname] = new Promise((resolve) => { resolveEvents = resolve; });

  if (!USE_LOCAL_EVENTS_DATA) {
    // in cache?
    const cacheEvents = await getCacheItem('events', fullname, route.maxqlog);
    if (cacheEvents !== null) {
      setEvents(fullname, cacheEvents);
      resolveEvents(cacheEvents);
      return;
    }
  }

  let driveEvents;
  try {
    driveEvents = await fetchRouteEvents(route);
  } catch (err) {
    console.error(err);
    // resolve and drop the entry, otherwise waiters hang forever and retries are impossible
    resolveEvents(null);
    delete eventsRequests[fullname];
    return;
  }

  setEvents(fullname, driveEvents);
  resolveEvents(driveEvents);
  if (!USE_LOCAL_EVENTS_DATA) {
    setCacheItem('events', fullname, cacheExpiry(), driveEvents, route.maxqlog);
  }
}

export async function fetchCoord(route, coord, locationKey) {
  if (!route || (!coord[0] && !coord[1])) {
    return;
  }
  const { fullname } = route;

  // loaded?
  if (routeData.locations[fullname]?.[locationKey]) {
    return;
  }

  const rounded = roundCoord(coord);

  // already requesting
  const cacheKey = JSON.stringify(rounded);
  if (coordsRequests[cacheKey] !== undefined) {
    const location = await coordsRequests[cacheKey];
    if (location) {
      setLocation(fullname, locationKey, location);
    }
    return;
  }

  let resolveLocation;
  coordsRequests[cacheKey] = new Promise((resolve) => { resolveLocation = resolve; });

  // in cache?
  const cacheCoords = await getCacheItem('coords', rounded);
  if (cacheCoords !== null) {
    setLocation(fullname, locationKey, cacheCoords);
    resolveLocation(cacheCoords);
    return;
  }

  const location = await reverseLookup(rounded);
  if (!location) {
    resolveLocation(null);
    delete coordsRequests[cacheKey];
    return;
  }

  setLocation(fullname, locationKey, location);
  resolveLocation(location);
  setCacheItem('coords', rounded, cacheExpiry(), location);
}

export function fetchLocations(route) {
  return Promise.all([
    fetchCoord(route, [route.start_lng, route.start_lat], 'startLocation'),
    fetchCoord(route, [route.end_lng, route.end_lat], 'endLocation'),
  ]);
}

export async function fetchDriveCoords(route) {
  if (!route) {
    return;
  }
  const { fullname } = route;

  // loaded?
  if (routeData.driveCoords[fullname]) {
    return;
  }

  // already requesting
  if (driveCoordsRequests[fullname] !== undefined) {
    const driveCoords = await driveCoordsRequests[fullname];
    if (driveCoords) {
      routeData.driveCoords[fullname] = driveCoords;
    }
    return;
  }

  let resolveDriveCoords;
  driveCoordsRequests[fullname] = new Promise((resolve) => { resolveDriveCoords = resolve; });

  if (!USE_LOCAL_COORDS_DATA) {
    // in cache?
    const cacheDriveCoords = await getCacheItem('driveCoords', fullname, route.maxqlog);
    if (cacheDriveCoords !== null) {
      routeData.driveCoords[fullname] = cacheDriveCoords;
      resolveDriveCoords(cacheDriveCoords);
      return;
    }
  }

  let driveCoords;
  try {
    driveCoords = await fetchRouteDriveCoords(route);
  } catch (err) {
    console.error(err);
    resolveDriveCoords(null);
    delete driveCoordsRequests[fullname];
    return;
  }

  routeData.driveCoords[fullname] = driveCoords;
  resolveDriveCoords(driveCoords);
  if (!USE_LOCAL_COORDS_DATA) {
    setCacheItem('driveCoords', fullname, cacheExpiry(), driveCoords, route.maxqlog);
  }
}
