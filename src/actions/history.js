import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { canonicalLocation, parseLocation, pathForState } from '../url';
import { checkRoutesData, loadDevice } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';
import * as Types from './types';
import { api } from '../api/backend';
import { resolveDriveRange } from '../utils/driveRange';
import { getDefaultFilter } from '../utils/filter';

const sameRange = (left, right) => left?.start === right?.start && left?.end === right?.end;

function selectedDrive(state, route) {
  if (state.dongleId !== route.dongleId) return null;
  return state.routeCache?.[route.selectedRouteId] || state.routes?.find((item) => item.log_id === route.selectedRouteId);
}

function boundedLocation(location, state) {
  const route = parseLocation(location);
  if (route.page !== 'drive' || !route.zoom) return null;
  const { zoom } = resolveDriveRange(route.zoom, selectedDrive(state, route));
  if (!zoom || sameRange(zoom, route.zoom)) return null;
  return { ...location, pathname: pathForState({ page: 'drive', dongleId: route.dongleId, selectedRouteId: route.selectedRouteId, zoom }) };
}

// One boundary applies initial loads, links, and browser Back/Forward alike.
// Data stays in Redux; the location determines which part of it is displayed.
export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let legacyLookup = null;
  return (next) => (action) => {
    if (!action) return;
    if (action.type === Types.ACTION_ROUTES_METADATA) {
      const { location } = getState().router;
      const route = parseLocation(location);
      // connectRouter removes `router` before calling the application reducer.
      // Pass this navigation's request as action context, not another state copy.
      const result = next({ ...action, requestedZoom: route.zoom, zoomPrevious: location.state?.zoomPrevious || null });
      const bounded = boundedLocation(location, getState());
      if (bounded) dispatch(replace(bounded));
      return result;
    }
    if (action.type !== LOCATION_CHANGE) return next(action);
    const { location } = action.payload;
    const previousLocation = getState().router.location;
    const previousRoute = parseLocation(previousLocation);
    if (legacyLookup && legacyLookup.pathname !== location.pathname) legacyLookup = null;
    const canonical = canonicalLocation(location);
    if (canonical !== `${location.pathname}${location.search || ''}${location.hash || ''}`) {
      return dispatch(replace(canonical, location.state));
    }
    const route = parseLocation(location);
    const result = next(action); // ConnectedRouter must see the location first.
    if (route.page === 'home' && getState().devices) {
      const { devices } = getState();
      if (devices.length) {
        const remembered = window.localStorage.getItem('selectedDongleId');
        const device = devices.find((item) => item.dongle_id === remembered) || devices[0];
        dispatch(replace({ ...location, pathname: pathForState({ page: 'device', dongleId: device.dongle_id }) }));
        return result;
      }
      dispatch(loadDevice(null));
    }

    if (route.dongleId && route.dongleId !== getState().dongleId) {
      dispatch(loadDevice(route.dongleId));
    }

    const dashboard = ['home', 'demo', 'device'].includes(route.page);
    const resetFilter = dashboard && !route.filter
      && (previousLocation.pathname !== location.pathname || previousRoute.filter);
    const filter = route.filter || (resetFilter ? getDefaultFilter() : null);
    if (filter && !sameRange(filter, getState().filter)) {
      if (getState().limit !== 5) dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
      dispatch({ type: Types.ACTION_SELECT_TIME_FILTER, ...filter });
    }

    const state = getState();
    const bounded = boundedLocation(location, state);
    if (bounded) {
      dispatch(replace(bounded));
      return result;
    }
    const { zoom, error } = resolveDriveRange(route.zoom, selectedDrive(state, route));
    const previous = location.state?.zoomPrevious || null;
    if (state.selectedRouteId !== route.selectedRouteId || !sameRange(state.zoom, zoom)) {
      dispatch({
        type: Types.TIMELINE_PUSH_SELECTION,
        log_id: route.selectedRouteId,
        start: route.zoom?.start ?? null,
        end: route.zoom?.end ?? null,
        previous,
        navigationError: error,
      });
      if (state.selectedRouteId !== route.selectedRouteId) dispatch(resetPlayback());
      dispatch(selectLoop(zoom?.start ?? null, zoom?.end ?? null));
    } else if (state.zoom && state.zoom.previous !== previous) {
      // Restore the destination's zoom ancestry; never append the future on POP.
      dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: route.selectedRouteId, ...route.zoom, previous, navigationError: error });
    } else if (state.navigationError !== error) {
      dispatch({ type: Types.ACTION_NAVIGATION_ERROR, error });
    }

    if (route.page === 'legacy') {
      if (legacyLookup) {
        if (legacyLookup.error) dispatch({ type: Types.ACTION_NAVIGATION_ERROR, error: legacyLookup.error });
        return result;
      }
      const lookup = { pathname: location.pathname, error: null };
      legacyLookup = lookup;
      const { start, end } = route.legacyZoom;
      api.routes.getRoutesSegments(route.dongleId, start, end).then((routes) => {
        if (legacyLookup !== lookup) return;
        if (!Array.isArray(routes)) throw new Error('Route lookup failed');
        if (!routes.length) {
          lookup.error = 'No drive found for this link.';
          dispatch({ type: Types.ACTION_NAVIGATION_ERROR, error: lookup.error });
          return;
        }
        const currentLocation = getState().router.location;
        dispatch(replace({
          ...currentLocation,
          pathname: pathForState({ page: 'drive', dongleId: route.dongleId, selectedRouteId: routes[0].fullname.split('|')[1] }),
        }));
      }).catch(() => {
        if (legacyLookup === lookup) {
          lookup.error = 'Unable to load this drive. Please try again.';
          dispatch({ type: Types.ACTION_NAVIGATION_ERROR, error: lookup.error });
        }
      });
      return result;
    }

    if (['home', 'demo', 'device', 'drive'].includes(route.page) && getState().dongleId) {
      if (!getState().limit) dispatch({ type: Types.ACTION_UPDATE_ROUTE_LIMIT, limit: 5 });
      dispatch(checkRoutesData());
    }
    return result;
  };
};
