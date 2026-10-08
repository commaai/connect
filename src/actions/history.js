import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseUrl } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

function sameZoom(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.floor(a.start / 1000) === Math.floor(b.start / 1000)
    && Math.floor(a.end / 1000) === Math.floor(b.end / 1000);
}

export function applyUrl(pathname, state, dispatch) {
  const url = parseUrl(pathname);

  // 1. device: switch only when the URL names a different dongle
  if (url.dongleId && url.dongleId !== state.dongleId) {
    dispatch(selectDevice(url.dongleId, { navigate: false, fetchRoutes: false }));
  }

  // 2. legacy timestamp link: resolve once, replacing the history entry so
  // browser back never lands on the legacy URL again.
  if (url.legacy && !url.logId) {
    const { start, end } = url.legacy;
    api.routes.getRoutesSegments(url.dongleId, start, end).then((routesData) => {
      if (routesData && routesData.length > 0) {
        const logId = routesData[0].fullname.split('|')[1];
        const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;
        dispatch(pushTimelineRange(logId, 0, duration, { navigate: true, replace: true }));
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
    dispatch(checkRoutesData());
    return;
  }

  // 3. drive / zoom: select only when the URL disagrees with state at URL precision,
  // so sub-second timeline selections are reused instead of overwritten.
  const wantZoom = url.start !== null && url.end !== null ? { start: url.start, end: url.end } : null;
  if (url.logId || state.selectedRouteId) {
    const sameRoute = (url.logId || null) === (state.selectedRouteId || null);
    if (!sameRoute || !sameZoom(wantZoom, state.zoom)) {
      dispatch(pushTimelineRange(url.logId || null, wantZoom?.start ?? null, wantZoom?.end ?? null, { navigate: false }));
    }
  } else if (wantZoom && !sameZoom(wantZoom, state.zoom)) {
    dispatch(pushTimelineRange(null, null, null, { navigate: false }));
  }

  // 4. pages: keep the existing prime/stream flags in sync with the URL
  // (components read them today; currentPage() is the future source).
  // Settings has no flag: explorer renders the modal directly from the URL.
  const wantPrime = url.page === 'prime';
  if (wantPrime !== !!state.primeNav) {
    dispatch(primeNav(wantPrime, { navigate: false }));
  }
  const wantStream = url.page === 'stream';
  if (wantStream !== !!state.streamNav) {
    dispatch(streamNav(wantStream, { navigate: false }));
  }

  // 5. route data for the (possibly new) device
  if (url.dongleId && url.dongleId !== state.dongleId) {
    dispatch(checkRoutesData());
  }
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE) {
    const state = getState();
    next(action); // must be first, otherwise breaks history
    applyUrl(action.payload.location.pathname, state, dispatch);
  } else {
    next(action);
  }
};

// Startup: reconcile the initial URL without pushing new history.
export function syncInitialUrl() {
  return (dispatch, getState) => {
    applyUrl(window.location.pathname, getState(), dispatch);
  };
}

export { replace };
