import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, urlForLocation } from '../url';
import { checkLastRoutesData, checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api, selectBackendType } from '../api/backend';
import { hardNavigate } from '../utils/navigation';

const sameRange = (left, right) => left?.start === right?.start && left?.end === right?.end;

function sameBaseNavigation(left, right) {
  return left && left.page === right.page && left.dongleId === right.dongleId
    && left.routeId === right.routeId && sameRange(left.zoom, right.zoom)
    && sameRange(left.legacyZoom, right.legacyZoom);
}

function locationIdentity(location) {
  return [location?.key, location?.pathname, location?.search || '', location?.hash || ''];
}

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let navigationVersion = 0;

  return (next) => (action) => {
    if (!action) {
      return;
    }
    if (action.type !== LOCATION_CHANGE || !['PUSH', 'POP', 'REPLACE'].includes(action.payload.action)) {
      return next(action);
    }

    const previousState = getState();
    const { location } = action.payload;
    const navigation = parseLocation(location);
    const baseChanged = !sameBaseNavigation(previousState.navigation, navigation);
    navigationVersion += 1;
    const version = navigationVersion;

    // Publish the location before applying its derived state. Internal actions
    // below never write history, including when replaying Back and Forward.
    const result = next({ ...action, payload: { ...action.payload, navigation } });
    const previousPathname = previousState.navigation?.pathname || previousState.router?.location?.pathname || location.pathname;
    if (selectBackendType(previousPathname) !== selectBackendType(location.pathname)) {
      hardNavigate(`${location.pathname}${location.search || ''}${location.hash || ''}`);
      return result;
    }

    const deviceChanged = navigation.dongleId && navigation.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(navigation.dongleId, false, false));
    }

    // Selecting a device clears both modes, so compare against the updated state.
    const prime = navigation.page === 'prime';
    const stream = navigation.page === 'stream';
    if (getState().primeNav !== prime) {
      dispatch(primeNav(prime, false));
    }
    if (getState().streamNav !== stream) {
      dispatch(streamNav(stream, false));
    }

    const routeChanged = getState().selectedRouteId !== navigation.routeId;
    if (routeChanged || (baseChanged && navigation.routeId)) {
      dispatch(pushTimelineRange(navigation.routeId, navigation.zoom?.start ?? null, navigation.zoom?.end ?? null, false));
    }

    if (navigation.page === 'drive' && (deviceChanged || routeChanged)) {
      dispatch(checkRoutesData());
    } else if (['device', 'demo'].includes(navigation.page) && (baseChanged || deviceChanged || routeChanged)) {
      dispatch(getState().limit === 0 ? checkLastRoutesData() : checkRoutesData());
    }

    if (navigation.page === 'legacy') {
      const identity = locationIdentity(location);
      const { dongleId, legacyZoom } = navigation;
      api.routes.getRoutesSegments(dongleId, legacyZoom.start, legacyZoom.end).then((routesData) => {
        const state = getState();
        const currentIdentity = locationIdentity(state.router?.location);
        if (version !== navigationVersion || state.dongleId !== dongleId
          || identity.some((value, index) => value !== currentIdentity[index]) || !routesData?.length) {
          return;
        }

        const [routeDongleId, routeId] = routesData[0].fullname.split('|');
        if (routeDongleId !== dongleId) {
          return;
        }
        dispatch(replace(urlForLocation({
          ...navigation,
          page: 'drive',
          routeId,
          zoom: null,
          legacyZoom: null,
        })));
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    return result;
  };
};
