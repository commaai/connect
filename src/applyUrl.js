import { getDefaultFilter, ROUTE_PAGE_SIZE } from './utils/filter';
import { hasRoutesData } from './timeline/segments';

// URL -> the state that should change, plus the fetches and playback resets
// still needed. Anything the URL does not mention is left as it is.

const EMPTY_META = { dongleId: null, start: null, end: null };

function sameZoom(a, b) {
  if (!a || !b) return !a && !b;
  return a.start === b.start && a.end === b.end;
}

function sameFilter(a, b) {
  return a?.start === b?.start && a?.end === b?.end;
}

function deviceRecord(state, dongleId) {
  if (!state.devices) return undefined;
  return state.devices.find((device) => device.dongle_id === dongleId)
    || (state.device?.dongle_id === dongleId ? state.device : null);
}

function driveRoute(state, logId) {
  return state.routes?.find((route) => route.log_id === logId) || null;
}

function wholeZoom(route) {
  return route ? { start: 0, end: route.duration } : null;
}

export function applyView(state, view) {
  const patch = {};
  const effects = [];
  const namesDevice = Boolean(view.dongleId);

  // Home, demo, referrals, auth, and unknown paths name no device.
  // The device and drive already on screen stay there.
  if (!namesDevice) return { patch, effects };

  const dongleChanged = view.dongleId !== state.dongleId;
  if (dongleChanged) {
    patch.dongleId = view.dongleId;
    patch.filter = view.filter || getDefaultFilter();
    patch.limit = 0;
    patch.subscription = null;
    patch.subscribeInfo = null;
    patch.files = null;
    patch.routes = null;
    patch.lastRoutes = null;
    patch.currentRoute = null;
    patch.routesMeta = { ...EMPTY_META };
    patch.selectedRouteId = null;
    patch.zoom = null;
    patch.loop = null;
    const device = deviceRecord(state, view.dongleId);
    if (device !== undefined) patch.device = device;
    effects.push({ type: 'device', dongleId: view.dongleId, previousId: state.dongleId || null });
  } else {
    const nextFilter = view.filter || getDefaultFilter();
    if (!sameFilter(state.filter, nextFilter)) {
      patch.filter = nextFilter;
      patch.limit = ROUTE_PAGE_SIZE;
      patch.routesMeta = { ...EMPTY_META };
      patch.lastRoutes = state.routes;
      // An open drive does not use the dashboard list. Drop the list only when
      // nothing on screen is still showing it.
      if (!state.selectedRouteId) {
        patch.routes = null;
        patch.currentRoute = null;
      }
      effects.push({ type: 'routes' });
    }
  }

  const current = { ...state, ...patch };

  if (view.page === 'legacy') {
    if (current.selectedRouteId || current.zoom || current.currentRoute) {
      patch.selectedRouteId = null;
      patch.currentRoute = null;
      patch.zoom = null;
      patch.loop = null;
    }
    effects.push({
      type: 'legacy',
      dongleId: view.dongleId,
      start: view.legacy.start,
      end: view.legacy.end,
    });
    return { patch, effects };
  }

  if (view.page === 'drive') {
    const route = driveRoute(current, view.logId) || (current.currentRoute?.log_id === view.logId ? current.currentRoute : null);
    if (current.selectedRouteId !== view.logId) {
      patch.selectedRouteId = view.logId;
      patch.currentRoute = route && route.log_id === view.logId ? route : null;
      patch.zoom = view.zoom || wholeZoom(patch.currentRoute);
      patch.loop = null;
      patch.files = null;
      effects.push({ type: 'drive' });
    } else if (view.zoom) {
      if (!sameZoom(current.zoom, view.zoom)) {
        const expanded = !current.zoom
          || view.zoom.start < current.zoom.start
          || view.zoom.end > current.zoom.end;
        if (expanded) patch.files = null;
        patch.zoom = view.zoom;
        effects.push({ type: 'zoom' });
      }
    } else if (route) {
      const full = wholeZoom(route);
      if (!sameZoom(current.zoom, full)) {
        patch.zoom = full;
        patch.currentRoute = route;
        if (current.zoom) patch.files = null;
        effects.push({ type: 'zoom' });
      }
    } else if (current.zoom) {
      // Whole-drive URL, and the route has not arrived. Drop the previous
      // window so the response can fill 0..duration instead of keeping it.
      patch.zoom = null;
      patch.loop = null;
      patch.files = null;
      effects.push({ type: 'zoom' });
    }
    return { patch, effects };
  }

  // Device, prime, and stream are not a drive. Referrals never gets here:
  // that path has no dongle id, so the open drive survives it.
  if (current.selectedRouteId || current.zoom || current.currentRoute) {
    patch.selectedRouteId = null;
    patch.currentRoute = null;
    patch.zoom = null;
    patch.loop = null;
    const next = { ...state, ...patch };
    if (!hasRoutesData(next)) {
      patch.routes = null;
      patch.lastRoutes = null;
    }
    effects.push({ type: 'leave-drive' });
  }

  return { patch, effects };
}
