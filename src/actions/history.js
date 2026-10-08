import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parsePath, devicePath, drivePath } from '../url';
import { checkRoutesData, checkLastRoutesData, syncPrimeNav, syncStreamNav, syncDevice, syncTimelineRange } from './index';
import { api } from '../api/backend';

// History is the source of truth for navigable screens. This runs for PUSH as
// well as POP/REPLACE, so links and browser navigation take the same path.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) return;
  const result = next(action);
  if (action.type !== LOCATION_CHANGE) return result;

  const path = action.payload.location.pathname;
  const route = parsePath(path);
  if (route.page === 'unknown') return result;

  let state = getState();
  if (route.page === 'home' && state.dongleId) {
    dispatch(replace(devicePath(state.dongleId)));
    return result;
  }
  const deviceChanged = Boolean(route.dongleId && route.dongleId !== state.dongleId);
  if (deviceChanged) {
    dispatch(syncDevice(route.dongleId));
    state = getState();
  }

  if (route.page === 'legacy-range') {
    // Old links use absolute times. Resolve them once and replace the URL;
    // do not let a late response override a newer browser navigation.
    api.routes.getRoutesSegments(route.dongleId, route.range.start, route.range.end)
      .then((routes) => {
        if (getState().router.location.pathname !== path || !routes?.length) return;
        const logId = routes[0].fullname.split('|')[1];
        if (logId) dispatch(replace(drivePath(route.dongleId, logId)));
      })
      .catch((err) => console.error('Error resolving legacy drive URL', err));
    return result;
  }

  const nextRouteId = route.routeId;
  const routeChanged = state.selectedRouteId !== nextRouteId;
  const rangeChanged = route.range
    ? state.zoom?.start !== route.range.start || state.zoom?.end !== route.range.end
    : Boolean(state.zoom && (state.zoom.start !== 0 || state.zoom.end !== state.currentRoute?.duration));
  if (deviceChanged || routeChanged || rangeChanged) {
    dispatch(syncTimelineRange(nextRouteId, route.range?.start ?? null, route.range?.end ?? null));
  }
  if ((route.page === 'prime') !== state.primeNav) dispatch(syncPrimeNav(route.page === 'prime'));
  if ((route.page === 'stream') !== state.streamNav) dispatch(syncStreamNav(route.page === 'stream'));

  if ((deviceChanged || routeChanged) && !nextRouteId) {
    dispatch(state.limit ? checkRoutesData() : checkLastRoutesData());
  } else if (deviceChanged || routeChanged || (nextRouteId && !state.currentRoute)) {
    dispatch(checkRoutesData());
  }
  return result;
};
