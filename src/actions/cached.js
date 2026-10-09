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

  try {
    const db = await getCacheDB();
    if (!db) return null;
    const transaction = db.transaction([store]);
    const req = transaction.objectStore(store).get(key);
    return await new Promise((resolve, reject) => {
      req.onsuccess = (ev) => {
        if (ev.target.result !== undefined && (version === undefined || ev.target.result.version >= version)) {
          resolve(ev.target.result.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = (ev) => reject(ev.target.error);
    });
  } catch (error) {
    // Storage is optional. A failed read must not prevent a network retry.
    console.error(error);
    return null;
  }
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

// Store only in-flight work here. All callers settle together, including on failure.
function pendingRequest(requests, key, load) {
  if (!requests[key]) {
    requests[key] = Promise.resolve().then(load).catch((error) => {
      console.error(error);
      return null;
    }).finally(() => { delete requests[key]; });
  }
  return requests[key];
}

async function loadSegments(route, asset, local) {
  const segments = await Promise.all(Array.from({ length: route.maxqlog + 1 }, async (_, segment) => {
    const url = new URL(api.routeAssets[asset](route, segment));
    if (local) url.hostname = 'chffrprivate.azureedge.local';
    const response = await fetch(url, { method: 'GET' });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Unable to load ${asset}: HTTP ${response.status}`);
    return response.json();
  }));
  return segments.flat();
}

export function fetchEvents(route) {
  return async (dispatch, getState) => {
    const state = getState();
    const cached = state.routes?.find((r) => r.fullname === route.fullname) || state.routeCache?.[route.log_id];
    if (cached?.fullname === route.fullname && cached.events) return;

    const driveEvents = await pendingRequest(eventsRequests, route.fullname, async () => {
      if (!USE_LOCAL_EVENTS_DATA) {
        const cacheEvents = await getCacheItem('events', route.fullname, route.maxqlog);
        if (cacheEvents !== null) return cacheEvents;
      }
      const result = parseEvents(route, await loadSegments(route, 'events', USE_LOCAL_EVENTS_DATA));
      if (!USE_LOCAL_EVENTS_DATA) {
        setCacheItem('events', route.fullname, Math.floor(Date.now() / 1000) + (86400 * 14), result, route.maxqlog).catch(console.error);
      }
      return result;
    });
    if (driveEvents === null) return;

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_EVENTS,
      fullname: route.fullname,
      events: driveEvents,
    });
  };
}

export function fetchCoord(route, coord, locationKey) {
  return async (dispatch, getState) => {
    const state = getState();
    if (!coord[0] && !coord[1]) {
      return;
    }

    const cached = state.routes?.find((r) => r.fullname === route.fullname) || state.routeCache?.[route.log_id];
    if (cached?.fullname === route.fullname && cached[locationKey]) return;

    // round for better caching
    const rounded = coord.map(value => Math.round(value * 1000) / 1000);
    const location = await pendingRequest(coordsRequests, JSON.stringify(rounded), async () => {
      const cacheCoords = await getCacheItem('coords', rounded);
      if (cacheCoords !== null) return cacheCoords;
      const result = await reverseLookup(rounded);
      if (!result) return null;
      setCacheItem('coords', rounded, Math.floor(Date.now() / 1000) + (86400 * 14), result).catch(console.error);
      return result;
    });
    if (location === null) return;

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LOCATION,
      fullname: route.fullname,
      locationKey,
      location,
    });
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
    const state = getState();
    const cached = state.routes?.find((r) => r.fullname === route.fullname) || state.routeCache?.[route.log_id];
    if (cached?.fullname === route.fullname && cached.driveCoords) return;

    const driveCoords = await pendingRequest(driveCoordsRequests, route.fullname, async () => {
      if (!USE_LOCAL_COORDS_DATA) {
        const cacheDriveCoords = await getCacheItem('driveCoords', route.fullname, route.maxqlog);
        if (cacheDriveCoords !== null) return cacheDriveCoords;
      }
      const coords = await loadSegments(route, 'coords', USE_LOCAL_COORDS_DATA);
      const result = Object.fromEntries(coords.map(({ t, lng, lat }) => [t, [lng, lat]]));
      if (!USE_LOCAL_COORDS_DATA) {
        setCacheItem('driveCoords', route.fullname, Math.floor(Date.now() / 1000) + (86400 * 14), result, route.maxqlog).catch(console.error);
      }
      return result;
    });
    if (driveCoords === null) return;

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE,
      fullname: route.fullname,
      route: {
        driveCoords,
      },
    });
  };
}
