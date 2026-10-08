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
          return;
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
    setTimeout(() => expireCacheItems(store).catch(console.error), 5000); // TODO: better expire time
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

function cachedRoute(state, route) {
  const cached = state.routeCache?.[route.log_id || route.fullname.split('|')[1]];
  return (cached?.fullname === route.fullname ? cached : null)
    || (state.currentRoute?.fullname === route.fullname ? state.currentRoute : null)
    || state.routes?.find((item) => item.fullname === route.fullname);
}

// These maps own only in-flight work. Loaded data lives in Redux/IndexedDB;
// a failed request must not leave future visits waiting on an abandoned promise.
function sharedRequest(requests, key, load) {
  if (!requests[key]) {
    requests[key] = Promise.resolve().then(load).catch((error) => {
      console.error(error);
      return null;
    }).finally(() => { delete requests[key]; });
  }
  return requests[key];
}

async function readCache(store, key, version) {
  try {
    return await getCacheItem(store, key, version);
  } catch (error) {
    // Browser storage is optional; a broken cache must not prevent a network read.
    console.error(error);
    return null;
  }
}

function writeCache(store, key, data, version) {
  setCacheItem(store, key, Math.floor(Date.now() / 1000) + (86400 * 14), data, version).catch(console.error);
}

async function fetchSegments(route, asset, local) {
  return Promise.all(Array.from({ length: route.maxqlog + 1 }, async (_, segment) => {
    const url = new URL(api.routeAssets[asset](route, segment));
    if (local) url.hostname = 'chffrprivate.azureedge.local';
    const response = await fetch(url, { method: 'GET' });
    if (response.status === 404) return []; // This segment has not been uploaded.
    if (!response.ok) throw new Error(`Unable to load ${asset}: HTTP ${response.status}`);
    return response.json();
  }));
}

export function fetchEvents(route) {
  return async (dispatch, getState) => {
    const loaded = cachedRoute(getState(), route);
    if (!loaded || loaded.events) return;

    const events = await sharedRequest(eventsRequests, route.fullname, async () => {
      if (!USE_LOCAL_EVENTS_DATA) {
        const cached = await readCache('events', route.fullname, route.maxqlog);
        if (cached !== null) return cached;
      }
      const segments = await fetchSegments(route, 'events', USE_LOCAL_EVENTS_DATA);
      const result = parseEvents(route, segments.flat());
      if (!USE_LOCAL_EVENTS_DATA) writeCache('events', route.fullname, result, route.maxqlog);
      return result;
    });
    if (events === null) return;
    dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: route.fullname, events });
  };
}

export function fetchCoord(route, coord, locationKey) {
  return async (dispatch, getState) => {
    const loaded = cachedRoute(getState(), route);
    if (!loaded || loaded[locationKey] || (!coord[0] && !coord[1])) return;

    const rounded = coord.map((value) => Math.round(value * 1000) / 1000);
    const location = await sharedRequest(coordsRequests, JSON.stringify(rounded), async () => {
      const cached = await readCache('coords', rounded);
      if (cached !== null) return cached;
      const result = await reverseLookup(rounded);
      if (!result) return null;
      writeCache('coords', rounded, result);
      return result;
    });
    if (location === null) return;
    dispatch({ type: Types.ACTION_UPDATE_ROUTE_LOCATION, fullname: route.fullname, locationKey, location });
  };
}

export function fetchLocations(route) {
  return (dispatch) => {
    dispatch(fetchCoord(route, [route.start_lng, route.start_lat], 'startLocation'));
    dispatch(fetchCoord(route, [route.end_lng, route.end_lat], 'endLocation'));
  };
}

export function fetchDriveCoords(route) {
  return async (dispatch, getState) => {
    const loaded = cachedRoute(getState(), route);
    if (!loaded || loaded.driveCoords) return;

    const driveCoords = await sharedRequest(driveCoordsRequests, route.fullname, async () => {
      if (!USE_LOCAL_COORDS_DATA) {
        const cached = await readCache('driveCoords', route.fullname, route.maxqlog);
        if (cached !== null) return cached;
      }
      const segments = await fetchSegments(route, 'coords', USE_LOCAL_COORDS_DATA);
      const result = Object.fromEntries(segments.flat().map(({ t, lng, lat }) => [t, [lng, lat]]));
      if (!USE_LOCAL_COORDS_DATA) writeCache('driveCoords', route.fullname, result, route.maxqlog);
      return result;
    });
    if (driveCoords === null) return;
    dispatch({ type: Types.ACTION_UPDATE_ROUTE, fullname: route.fullname, route: { driveCoords } });
  };
}
