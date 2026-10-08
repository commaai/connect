import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, pathFor } from '../url';
import { checkLastRoutesData, checkSelectedRoute, applyDevice, applyTimeline } from './index';
import { api } from '../api/backend';

// Every URL change, whether a link, an action or the browser's back button, ends up here.
// The page itself is read straight from the URL; only data the page needs is loaded into state.
function applyLocation(location) {
  return (dispatch, getState) => {
    const { dongleId, routeId, zoom, legacyZoom } = parseLocation(location);
    const deviceChanged = dongleId && dongleId !== getState().dongleId;

    if (deviceChanged) {
      dispatch(applyDevice(dongleId));
    }
    dispatch(applyTimeline(routeId, zoom));
    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    } else {
      dispatch(checkSelectedRoute());
    }

    if (legacyZoom) {
      dispatch(resolveLegacyZoom(location.pathname, dongleId, legacyZoom));
    }
  };
}

// Legacy links point at a time range rather than a route; swap in the route that contains it.
function resolveLegacyZoom(pathname, dongleId, { start, end }) {
  return (dispatch, getState) => api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
    if (routesData?.length && getState().router.location.pathname === pathname) {
      const routeId = routesData[0].fullname.split('|')[1];
      dispatch(replace(pathFor({ page: 'drive', dongleId, routeId })));
    }
  }).catch((err) => {
    console.error('Error fetching routes data for log ID conversion', err);
  });
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action); // must be first, otherwise breaks history
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyLocation(action.payload.location));
  }
  return result;
};
