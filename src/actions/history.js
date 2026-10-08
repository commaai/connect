import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { Pages, parsePath } from '../url';
import { api } from '../api/backend';
import { checkRoutesData, primeNav, pushTimelineRange, selectDevice, streamNav } from './index';

// URL -> state, in one place. Every location change is applied by diffing
// the parsed path against the store and dispatching only what differs, so
// state is reused between URL changes and the same function serves cold
// entries, browser navigation, and in-app pushes idempotently.
export function applyPath(pathname) {
  return (dispatch, getState) => {
    let state = getState();
    const route = parsePath(pathname);

    if (route.dongleId && route.dongleId !== state.dongleId) {
      dispatch(selectDevice(route.dongleId, false, false));
      dispatch(checkRoutesData());
      state = getState();
    }

    if (route.page === Pages.DRIVE) {
      if (!driveIsApplied(state, route)) {
        dispatch(pushTimelineRange(route.routeId, route.range?.[0] ?? null, route.range?.[1] ?? null, false));
      }
    } else if (state.selectedRouteId) {
      // any other page closes the open drive
      dispatch(pushTimelineRange(null, null, null, false));
    }

    if (route.page === Pages.LEGACY_RANGE) {
      dispatch(resolveLegacyRange(route));
    }

    if ((route.page === Pages.PRIME) !== Boolean(state.primeNav)) {
      dispatch(primeNav(route.page === Pages.PRIME, false));
    }
    if ((route.page === Pages.STREAM) !== Boolean(state.streamNav)) {
      dispatch(streamNav(route.page === Pages.STREAM, false));
    }
  };
}

// a drive URL is applied when the selection, the range, and the playback
// loop derived from it all match; the loop is derived by the routes metadata
// reducer while the route is still loading
function driveIsApplied(state, route) {
  if (state.selectedRouteId !== route.routeId) {
    return false;
  }
  if (route.range) {
    if (state.zoom?.start !== route.range[0] || state.zoom?.end !== route.range[1]) {
      return false;
    }
  } else if (state.zoom != null
    && !(state.zoom.start === 0 && state.zoom.end === state.currentRoute?.duration)) {
    return false;
  }
  return state.loop != null || state.currentRoute == null;
}

// legacy timestamp URLs predate route ids; replace them with the canonical
// route URL for the first route in the range, and let applyPath do the rest
function resolveLegacyRange(route) {
  return async (dispatch) => {
    const [start, end] = route.range;
    try {
      const routes = await api.routes.getRoutesSegments(route.dongleId, start, end);
      const first = routes && routes[0];
      if (first) {
        const routeId = first.fullname.split('|')[1];
        dispatch(replace(`/${route.dongleId}/${routeId}`));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE) {
    globalThis.__locationCount = (globalThis.__locationCount || 0) + 1;
    if (globalThis.__locationCount % 25 === 0) console.log('LOCATION_CHANGE count:', globalThis.__locationCount);
    next(action); // must be first, otherwise breaks history
    dispatch(applyPath(action.payload.location.pathname));
    return;
  }
  next(action);
};
