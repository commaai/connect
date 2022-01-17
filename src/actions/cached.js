import * as Types from './types';
import GeocodeApi from '../api/geocode';

import { isDemoRoute } from '../demo';

const demoEvents = require('../demo/events.json');

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

  let request = window.indexedDB.open('cacheDB', 1);
  return new Promise((resolve) => {
    request.onerror = () => {
      resolve(null);
    };
    request.onsuccess = (ev) => {
      resolve(ev.target.result);
    };
    request.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const routeStore = db.createObjectStore('events', { keyPath: 'key' });
      routeStore.createIndex('key', 'key', { unique: true });
      routeStore.createIndex('expiry', 'expiry', { unique: false });
      const coordsStore = db.createObjectStore('coords', { keyPath: 'key' });
      coordsStore.createIndex('key', 'key', { unique: true });
      coordsStore.createIndex('expiry', 'expiry', { unique: false });
      const driveCoordsStore = db.createObjectStore('driveCoords', { keyPath: 'key' });
      driveCoordsStore.createIndex('key', 'key', { unique: true });
      driveCoordsStore.createIndex('expiry', 'expiry', { unique: false });

      let completed = 0;
      const allCompleted = () => { if (completed == 3) resolve(db); };
      routeStore.transaction.oncomplete = () => { completed++; allCompleted(); };
      coordsStore.transaction.oncomplete = () => { completed++; allCompleted(); };
      driveCoordsStore.transaction.oncomplete = () => { completed++; allCompleted(); };
    }
  });
}

async function getCacheItem(store, key) {
  if (!hasExpired) {
    setTimeout(() => expireCacheItems(store), 5000);  // TODO: better expire time
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
      resolve(ev.target.result !== undefined ? ev.target.result.data : null);
    };
    req.onerror = reject;
  })
}

async function setCacheItem(store, key, expiry, data) {
  const db = await getCacheDB();
  if (!db) {
    return null;
  }

  const transaction = db.transaction([store], 'readwrite');
  const req = transaction.objectStore(store).add({ key, expiry, data });

  return new Promise((resolve, reject) => {
    req.onsuccess = resolve;
    req.onerror = reject;
  })
}

async function expireCacheItems(store) {
  const db = await getCacheDB();
  if (!db) {
    return null;
  }

  const transaction = db.transaction([store], 'readwrite');
  const objStore = transaction.objectStore(store);

  const idx = IDBKeyRange.upperBound(parseInt(Date.now()/1000));
  const req = objStore.index('expiry').openCursor(idx);
  req.onsuccess = (ev) => {
    let cursor = ev.target.result;
    if (cursor) {
      objStore.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
}

export function fetchEvents(route) {
  return async (dispatch, getState) => {
    const state = getState();
    if (!state.segments) {
      return;
    }

    // loaded?
    for (const r of state.segments) {
      if (r.route === route.route) {
        if (r.events !== null) {
          return;
        }
        break;
      }
    }

    // already requesting
    if (eventsRequests[route.route] !== undefined) {
      const driveEvents = await eventsRequests[route.route];
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_EVENTS,
        route: route.route,
        events: driveEvents,
      });
      return;
    }

    let resolveEvents;
    eventsRequests[route.route] = new Promise((resolve) => { resolveEvents = resolve; });

    // in cache?
    const cacheEvents = await getCacheItem('events', route.route);
    if (cacheEvents !== null) {
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_EVENTS,
        route: route.route,
        events: cacheEvents,
      });
      resolveEvents(cacheEvents);
      return;
    }

    let driveEvents;
    if (isDemoRoute(route.route)) {
      driveEvents = [].concat(...demoEvents);
    } else {
      const promises = [];
      for (let i = 0; i < route.segments; i++) {
        promises.push((async (i) => {
          const resp = await fetch(`${route.url}/${i}/events.json`, { method: 'GET' });
          if (!resp.ok) {
            return [];
          }
          const events = await resp.json();
          return events;
        })(i));
      }

      try {
        driveEvents = [].concat(...(await Promise.all(promises)));
      } catch (err) {
        console.log(err);
        return;
      }
    }

    driveEvents = driveEvents.filter((ev) => ['engage', 'disengage', 'alert'].includes(ev.type));
    driveEvents.sort((a, b) => {
      if (a.route_offset_millis === b.route_offset_millis) {
        return a.route_offset_nanos - b.route_offset_nanos;
      }
      return a.route_offset_millis - b.route_offset_millis;
    });

    let lastEngage = null;
    for (const ev of driveEvents) {
      if (ev.type === 'engage') {
        lastEngage = ev;
      } else if (ev.type === 'disengage' && lastEngage) {
        lastEngage.data = {
          end_offset_nanos: ev.offset_nanos,
          end_offset_millis: ev.offset_millis,
          end_route_offset_nanos: ev.route_offset_nanos,
          end_route_offset_millis: ev.route_offset_millis,
        };
      }
    }

    // reduce size, keep only used data
    driveEvents = driveEvents.filter((ev) => ['engage', 'alert'].includes(ev.type) && ev.data);
    driveEvents = driveEvents.map((ev) => ({
      type: ev.type,
      route_offset_millis: ev.route_offset_millis,
      data: {
        alertStatus: ev.data.alertStatus,
        end_route_offset_millis: ev.data.end_route_offset_millis,
      },
    }));

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_EVENTS,
      route: route.route,
      events: driveEvents,
    });
    resolveEvents(driveEvents);
    setCacheItem('events', route.route, parseInt(Date.now()/1000) + (86400*14), driveEvents);
  }
}

export function fetchLocations(route) {
  return (dispatch, getState) => {
    dispatch(fetchCoord(route, route.startCoord, 'startLocation'));
    dispatch(fetchCoord(route, route.endCoord, 'endLocation'));
  }
};

export function fetchCoord(route, coord, locationKey) {
  return async (dispatch, getState) => {
    const state = getState();
    if (!state.segments || (coord[0] === 0 && coord[1] === 0)) {
      return;
    }

    // loaded?
    for (const r of state.segments) {
      if (r.route === route.route) {
        if (r[locationKey] !== null) {
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
        route: route.route,
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
        route: route.route,
        locationKey,
        location: cacheCoords,
      });
      resolveLocation(cacheCoords);
      return;
    }

    const location = await GeocodeApi().reverseLookup(coord);
    if (!location) {
      return;
    }

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_LOCATION,
      route: route.route,
      locationKey,
      location,
    });
    resolveLocation(location);
    setCacheItem('coords', coord, parseInt(Date.now()/1000) + (86400*14), location);
  }
}

export function fetchDriveCoords(route) {
  return async (dispatch, getState) => {
    const state = getState();
    if (!state.segments) {
      return;
    }

    // loaded?
    for (const r of state.segments) {
      if (r.route === route.route) {
        if (r.driveCoords !== null) {
          return;
        }
        break;
      }
    }

    // already requesting
    if (driveCoordsRequests[route.route] !== undefined) {
      const driveCoords = await driveCoordsRequests[route.route];
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_DRIVE_COORDS,
        route: route.route,
        driveCoords,
      });
      return;
    }

    let resolveDriveCoords;
    driveCoordsRequests[route.route] = new Promise((resolve) => { resolveDriveCoords = resolve; });

    // in cache?
    const cacheDriveCoords = await getCacheItem('driveCoords', route.route);
    if (cacheDriveCoords !== null) {
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_DRIVE_COORDS,
        route: route.route,
        driveCoords: cacheDriveCoords,
      });
      resolveDriveCoords(cacheDriveCoords);
      return;
    }

    const promises = [];
    for (let i = 0; i < route.segments; i++) {
      promises.push((async (i) => {
        const resp = await fetch(`${route.url}/${i}/coords.json`, { method: 'GET' });
        if (!resp.ok) {
          return [];
        }
        const events = await resp.json();
        return events;
      })(i));
    }

    let driveCoords;
    try {
      driveCoords = await Promise.all(promises);
    } catch (err) {
      console.log(err);
      return [];
    }

    driveCoords = driveCoords.reduce((prev, curr, fakeI) => {
      return prev.concat(curr.map((cs) => ({
        t: ((fakeI - 1) * 60) + cs.t,
        c: [cs.lng, cs.lat],
      })));
    }, []);

    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_DRIVE_COORDS,
      route: route.route,
      driveCoords,
    });
    resolveDriveCoords(driveCoords);
    setCacheItem('driveCoords', route.route, parseInt(Date.now()/1000) + (86400*14), driveCoords);
  }
}
