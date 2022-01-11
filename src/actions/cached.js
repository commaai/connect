import * as Types from './types';

const eventsRequests = {};
let hasExpired = false;
let cacheDB = null;

async function getCacheDB() {
  if (cacheDB !== null) {
    return Promise.resolve(cacheDB);
  }

  let request = window.indexedDB.open('cacheDB', 1);
  return new Promise((resolve, reject) => {
    request.onerror = reject;
    request.onsuccess = (ev) => {
      resolve(ev.target.result);
    };
    request.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const routeStore = db.createObjectStore('events', { keyPath: 'key' });
      routeStore.createIndex('key', 'key', { unique: true });
      routeStore.createIndex('expiry', 'expiry', { unique: false });

      routeStore.transaction.oncomplete = () => {
        resolve(db);
      };
    }
  });
}

async function getCacheItem(store, key) {
  if (!window.indexedDB) {
    return null;
  }

  if (!hasExpired) {
    setTimeout(() => expireCacheItems(store), 5000);
    hasExpired = true;
  }

  const db = await getCacheDB();
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
  if (!window.indexedDB) {
    return null;
  }

  const db = await getCacheDB();
  const transaction = db.transaction([store], 'readwrite');
  const req = transaction.objectStore(store).add({ key, expiry, data });

  return new Promise((resolve, reject) => {
    req.onsuccess = resolve;
    req.onerror = reject;
  })
}

async function expireCacheItems(store) {
  if (!window.indexedDB) {
    return null;
  }

  const db = await getCacheDB();
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
      return;
    }
    eventsRequests[route.route] = true;

    // in cache?
    const cacheEvents = await getCacheItem('events', route.route);
    if (cacheEvents !== null) {
      dispatch({
        type: Types.ACTION_UPDATE_ROUTE_EVENTS,
        route: route.route,
        events: cacheEvents,
      });
      return;
    }

    const promises = [];
    for (let i = 0; i < route.segments; i++) {
      promises.push((async (i) => {
        try {
          const resp = await fetch(`${route.url}/${i}/events.json`, { method: 'GET' });
          const events = await resp.json();
          return events;
        } catch (err) {
          console.log(err);
          return [];
        }
      })(i));
    }

    let driveEvents = [].concat(...(await Promise.all(promises)));
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

    setCacheItem('events', route.route, parseInt(Date.now()/1000) + (86400*14), driveEvents);
    dispatch({
      type: Types.ACTION_UPDATE_ROUTE_EVENTS,
      route: route.route,
      events: driveEvents,
    });
    delete eventsRequests[route.route];
  }
}
