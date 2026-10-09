import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, formatDevicePath } from '../url';
import { ACTION_NAVIGATION } from './types';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

const sameRange = (left, right) => left?.start === right?.start && left?.end === right?.end;

export const onHistoryMiddleware = ({ dispatch, getState }) => {
  let revision = 0;
  let pathname;
  return (next) => (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);

    const firstLocation = pathname === undefined;
    if (pathname !== action.payload.location.pathname) revision += 1;
    pathname = action.payload.location.pathname;
    const requestRevision = revision;
    const state = getState();
    const navigation = parseLocation(action.payload.location);
    const previous = state.navigation;
    const result = next(action);
    dispatch({ type: ACTION_NAVIGATION, navigation });
    if (['auth', 'unknown'].includes(navigation.page)) return result;

    const deviceChanged = navigation.dongleId && navigation.dongleId !== state.dongleId;
    if (deviceChanged) dispatch(selectDevice(navigation.dongleId, false, false));

    const selectionChanged = firstLocation || deviceChanged || !previous
      || navigation.routeId !== previous.routeId
      || !sameRange(navigation.routeZoom, previous.routeZoom)
      || !sameRange(navigation.legacyZoom, previous.legacyZoom);
    const selectionMatches = !deviceChanged && navigation.routeId === state.selectedRouteId
      && (navigation.routeZoom ? sameRange(navigation.routeZoom, state.zoom)
        : !state.zoom || (state.zoom.start === 0 && state.zoom.end === state.currentRoute?.duration));
    if (selectionChanged && !selectionMatches && !navigation.legacyZoom
      && (navigation.routeId || state.selectedRouteId)) {
      dispatch(pushTimelineRange(navigation.routeId,
        navigation.routeZoom?.start ?? null, navigation.routeZoom?.end ?? null, false));
    }

    if (navigation.primeNav !== getState().primeNav) dispatch(primeNav(navigation.primeNav, false));
    if (navigation.streamNav !== getState().streamNav) dispatch(streamNav(navigation.streamNav, false));
    const routesState = getState();
    const needsDrive = navigation.routeId && !routesState.routes?.some((route) => route.log_id === navigation.routeId);
    const needsDashboard = navigation.page === 'dashboard' && previous?.routeId
      && routesState.routesMeta?.complete === false;
    if (deviceChanged || (selectionChanged && (needsDrive || needsDashboard))) dispatch(checkRoutesData());

    if (selectionChanged && navigation.legacyZoom) {
      const { start, end } = navigation.legacyZoom;
      api.routes.getRoutesSegments(navigation.dongleId, start, end).then((routes) => {
        if (requestRevision !== revision || !routes?.length) return;
        const routeId = routes[0].fullname?.split('|')[1];
        if (!routeId) return;
        dispatch(replace({ ...(getState().router?.location || action.payload.location),
          pathname: formatDevicePath({ dongleId: navigation.dongleId, routeId }) }));
      }).catch((error) => {
        if (requestRevision === revision) console.error('Error fetching routes data for log ID conversion', error);
      });
    }
    return result;
  };
};
