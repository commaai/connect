import * as Sentry from '@sentry/react';

import * as Types from './types';
import { api } from '../api/backend';
import { reverseLookup } from '../utils/geocode';

const USE_LOCAL_COORDS_DATA = import.meta.env.VITE_APP_LOCAL_COORDS_DATA === 'true';
if (USE_LOCAL_COORDS_DATA) {
  console.warn('using local coords data');
}
const USE_LOCAL_EVENTS_DATA = import.meta.env.VITE_APP_LOCAL_EVENTS_DATA === 'true';
if (USE_LOCAL_EVENTS_DATA) {
  console.warn('using local events data');
}

const eventsRequests = {};
const coordsRequests = {};
const driveCoordsRequests = {};
let hasExpired = false;
let cacheDB = null;

async function getCacheDB() {
  if (cacheDB !== null) {
    return Promise.resolve(cacheDB);
  }

  if (!window.indexedDB) {
    return Promise.resolve(null);
  }

  let request;
  try {
    request = window.indexedDB.open('cacheDB', 2);
  } catch (err) {
    console.error(err);
    Sentry.captureException(err, { fingerprint: 'cached_open_indexeddb' });
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    request.onerror = (ev) => {
      console.log(ev.target.error);
      resolve(null);
    };
    request.onsuccess = (ev) => {
      const db = ev.target.result;
      for (const store of ['events', 'coords', 'driveCoords']) {
        if (!db.objectStoreNames.contains(store)) {
          console.log('cannot find store in indexedDB', store);
          resolve(null);
        }
      }
      cacheDB = db;
      resolve(db);
    };
    request.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      for (const store of db.objectStoreNames) {
        try {
          db.deleteObjectStore(store);
        } catch (err) {
          console.error(err);
          Sentry.captureException(err, { fingerprint: 'cached_delete_obj_store' });
          resolve(null);
          return;
        }
      }

      const routeStore = db.createObjectStore('events', { keyPath: 'key' });
      routeStore.createIndex('key', 'key', { unique: true });
      routeStore.createIndex('expiry', 'expiry', { unique: false });
      const coordsStore = db.createObjectStore('coords', { keyPath: 'key' });
      coordsStore.createIndex('key', 'key', { unique: true });
      coordsStore.createIndex('expiry', 'expiry', { unique: false });
      const driveCoordsStore = db.createObjectStore('driveCoords', { keyPath: 'key' });
      driveCoordsStore.createIndex('key', 'key', { unique: true });
      driveCoordsStore.createIndex('expiry', 'expiry', { unique: false });
    };
  });
}

async function expireCacheItems(store) {
  const db = await getCacheDB();
  if (!db) {
    return;
  }

  const transaction = db.transaction([store], 'readwrite');
  const objStore = transaction.objectStore(store);

  const idx = IDBKeyRange.upperBound(Math.floor(Date.now() / 1000));
  const req = objStore.index('expiry').openCursor(idx);
  req.onsuccess = (ev) => {
    const cursor = ev.target.result;
    if (cursor) {
      objStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
}

async function getCacheItem(store, key, version = undefined) {
  if (!hasExpired) {
    setTimeout(() => expireCacheItems(store), 5000); // TODO: better expire time
    hasExpired = true;
  }

  const db = await getCacheDB();
  if (!db) {
    return null;
  }

  const transaction = db.transaction([store]);
  const req = transaction.objectStore(store).get(key);

  return new Promise((resolve, reject) => {
    req.onsuccess = (ev) => {
      if (ev.target.result !== undefined && (version === undefined || ev.target.result.version >= version)) {
        resolve(ev.target.result.data);
      } else {
        resolve(null);
      }
    };
    req.onerror = (ev) => reject(ev.target.error);
  });
}

async function setCacheItem(store, key, expiry, data, version = undefined) {
  const db = await getCacheDB();
  if (!db) {
    return null;
  }

  const transaction = db.transaction([store], 'readwrite');
  const val = { key, expiry, data };
  if (version !== undefined) {
    val.version = version;
  }
  const req = transaction.objectStore(store).put(val);

  return new Promise((resolve, reject) => {
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = (ev) => reject(ev.target.error);
  });
}

function parseEvents(route, driveEvents) {
  // sort events
  driveEvents.sort((a, b) => {
    if (a.route_offset_millis === b.route_offset_millis) {
      return a.route_offset_nanos - b.route_offset_nanos;
    }
    return a.route_offset_millis - b.route_offset_millis;
  });

  // create useful drive events from data
  let res = [];
  let currEngaged = null;
  let currAlert = null;
  let currOverride = null;
  let lastEngage = null;
  let currBookmark = null;
  for (const ev of driveEvents) {
    if (ev.type === 'state') {
      if (currEngaged !== null && !ev.data.enabled) {
        currEngaged.data.end_route_offset_millis = ev.route_offset_millis;
        currEngaged = null;
      }
      if (currEngaged === null && ev.data.enabled) {
        currEngaged = {
          ...ev,
          data: { ...ev.data },
          type: 'engage',
        };
        res.push(currEngaged);
      }

      if (currAlert !== null && ev.data.alertStatus !== currAlert.data.alertStatus) {
        currAlert.data.end_route_offset_millis = ev.route_offset_millis;
        currAlert = null;
      }
      if (currAlert === null && ev.data.alertStatus !== 'normal') {
        currAlert = {
          ...ev,
          data: { ...ev.data },
          type: 'alert',
        };
        res.push(currAlert);
      }

      if (currOverride !== null && ev.data.state !== currOverride.data.state) {
        currOverride.data.end_route_offset_millis = ev.route_offset_millis;
        currOverride = null;
      }
      if (currOverride === null && ['overriding', 'preEnabled'].includes(ev.data.state)) {
        currOverride = {
          ...ev,
          data: { ...ev.data },
          type: 'overriding',
        };
        res.push(currOverride);
      }
    } else if (ev.type === 'engage') {
      lastEngage = {
        ...ev,
        data: { ...ev.data },
      };
      res.push(lastEngage);
    } else if (ev.type === 'disengage' && lastEngage) {
      lastEngage.data = {
        end_route_offset_millis: ev.route_offset_millis,
      };
    } else if (ev.type === 'alert') {
      res.push(ev);
    } else if (ev.type === 'event') {
      res.push(ev);
    } else if (ev.type === 'user_bookmark' || ev.type === 'user_flag') {
      currBookmark = {
        ...ev,
        data: {
          ...ev.data,
          end_route_offset_millis: ev.route_offset_millis + 1e3,
        },
        type: 'bookmark',
      };
      res.push(currBookmark);
    }
  }

  // make sure events have an ending
  if (currEngaged !== null) {
    currEngaged.data.end_route_offset_millis = route.duration;
  }
  if (currAlert !== null) {
    currAlert.data.end_route_offset_millis = route.duration;
  }
  if (currOverride !== null) {
    currOverride.data.end_route_offset_millis = route.duration;
  }
  if (lastEngage && lastEngage.data?.end_route_offset_millis === undefined) {
    lastEngage.data = {
      end_route_offset_millis: route.duration,
    };
  }

  // reduce size, keep only used data
  res = res.map((ev) => ({
    type: ev.type,
    route_offset_millis: ev.route_offset_millis,
    data: {
      state: ev.data.state,
      event_type: ev.data.event_type,
      alertStatus: ev.data.alertStatus,
      end_route_offset_millis: ev.data.end_route_offset_millis,
    },
  }));

  return res;
}

// Coalesce by route; only complete results enter the existing persistent cache.
async function fetchSegmentData(route, store, type, parse) {
  const local = (type === 'events' && USE_LOCAL_EVENTS_DATA) || (type === 'coords' && USE_LOCAL_COORDS_DATA);
  try {
    const cached = local ? null : await getCacheItem(store, route.fullname, route.maxqlog);
    if (cached !== null) return { data: cached, incomplete: false };
  } catch (error) { console.debug('Route asset cache unavailable', error); }
  const results = await Promise.allSettled(Array.from({ length: (route.maxqlog ?? -1) + 1 }, async (_, segment) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const url = new URL(api.routeAssets[type](route, segment));
      if (local) {
        url.hostname = 'chffrprivate.azureedge.local';
      }
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`Unable to load ${type}: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error(`Invalid ${type} data`);
      return data;
    } finally { clearTimeout(timeout); }
  }));
  const incomplete = results.some((result) => result.status === 'rejected');
  const data = parse(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []));
  if (!incomplete && !local) {
    setCacheItem(store, route.fullname, Math.floor(Date.now() / 1000) + 86400 * 14, data, route.maxqlog)
      .catch((error) => console.debug('Unable to cache route assets', error));
  }
  return { data, incomplete };
}

export function fetchEvents(route) {
  return async (dispatch, getState) => {
    const current = getState().routes?.find((r) => r.fullname === route.fullname);
    if (!current || (current.events && !current.eventsError)) return;
    if (!eventsRequests[route.fullname]) {
      eventsRequests[route.fullname] = fetchSegmentData(route, 'events', 'events', (events) => parseEvents(route, events))
        .catch(() => ({ data: [], incomplete: true }))
        .finally(() => { delete eventsRequests[route.fullname]; });
    }
    const { data, incomplete } = await eventsRequests[route.fullname];
    dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: route.fullname, events: data });
    dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: route.fullname, route: { eventsError: incomplete } });
  };
}

export function fetchCoord(route, coord, locationKey) {
  return async (dispatch, getState) => {
    const state = getState();
    if (!state.routes || (!coord[0] && !coord[1])) {
      return;
    }

    // loaded?
    for (const r of state.routes) {
      if (r.fullname === route.fullname) {
        if (r[locationKey]) {
          return;
        }
        break;
      }
    }

    // round for better caching
    coord[0] = Math.round(coord[0] * 1000) / 1000;
    coord[1] = Math.round(coord[1] * 1000) / 1000;

    // already requesting
    const cacheKey = JSON.stringify(coord);
    if (coordsRequests[cacheKey] !== undefined) {
      const location = await coordsRequests[cacheKey];
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_LOCATION,
        fullname: route.fullname,
        locationKey,
        location,
      });
      return;
    }

    let resolveLocation;
    coordsRequests[cacheKey] = new Promise((resolve) => { resolveLocation = resolve; });

    // in cache?
    const cacheCoords = await getCacheItem('coords', coord);
    if (cacheCoords !== null) {
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_LOCATION,
        fullname: route.fullname,
        locationKey,
        location: cacheCoords,
      });
      resolveLocation(cacheCoords);
      return;
    }

    const location = await reverseLookup(coord);
    if (!location) {
      return;
    }

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LOCATION,
      fullname: route.fullname,
      locationKey,
      location,
    });
    resolveLocation(location);
    setCacheItem('coords', coord, Math.floor(Date.now() / 1000) + (86400 * 14), location);
  };
}

export function fetchLocations(route) {
  return (dispatch, getState) => {
    dispatch(fetchCoord(route, [route.start_lng, route.start_lat], 'startLocation'));
    dispatch(fetchCoord(route, [route.end_lng, route.end_lat], 'endLocation'));
  };
}

export function fetchDriveCoords(route) {
  return async (dispatch, getState) => {
    const current = getState().routes?.find((r) => r.fullname === route.fullname);
    if (!current || (current.driveCoords && !current.driveCoordsError)) return;
    if (!driveCoordsRequests[route.fullname]) {
      driveCoordsRequests[route.fullname] = fetchSegmentData(route, 'driveCoords', 'coords', (coords) =>
        Object.fromEntries(coords.filter((c) => Number.isFinite(c.t) && Number.isFinite(c.lng) && Number.isFinite(c.lat))
          .map((c) => [c.t, [c.lng, c.lat]])))
        .catch(() => ({ data: {}, incomplete: true }))
        .finally(() => { delete driveCoordsRequests[route.fullname]; });
    }
    const { data, incomplete } = await driveCoordsRequests[route.fullname];
    dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: route.fullname,
      route: { driveCoords: data, driveCoordsError: incomplete } });
  };
}
