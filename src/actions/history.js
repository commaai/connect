import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { destinationFromUrl, isPublic, pathForDestination } from '../url';
import { checkLastRoutesData, checkRoutesData, fetchDeviceOnline, primeFetchSubscription, pushTimelineRange } from './index';
import * as Types from './types';
import { api } from '../api/backend';
import { webrtcConnectionManager } from '../utils/webrtc';

function resolveLegacy(pathname, { dongleId, start, end }) {
  return async (dispatch, getState) => {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routesData?.length && getState().router.location.pathname === pathname) {
        dispatch(replace(pathForDestination({ page: 'drive', dongleId, logId: routesData[0].fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

function syncStateFromUrl(location) {
  return (dispatch, getState) => {
    const destination = destinationFromUrl(location.pathname, location.search);
    const path = pathForDestination(destination);
    if (destination.dongleId && destination.page !== 'legacy' && path !== location.pathname) {
      dispatch(replace({ ...location, pathname: path }));
      return;
    }
    if (destination.page === 'root' && getState().dongleId) {
      dispatch(replace({ ...location, pathname: pathForDestination({ dongleId: getState().dongleId }) }));
      return;
    }
    if (!destination.dongleId || (!api.auth.isAuthenticated() && !isPublic(destination))) {
      return;
    }

    if (destination.dongleId !== getState().dongleId) {
      if (getState().dongleId) {
        webrtcConnectionManager.disconnect();
      }
      dispatch({ type: Types.ACTION_SELECT_DEVICE, dongleId: destination.dongleId });
      const { device, profile } = getState();
      if ((device && !device.shared) || profile?.superuser) {
        dispatch(primeFetchSubscription(destination.dongleId, device));
        dispatch(fetchDeviceOnline(destination.dongleId));
      }
    }
    if (destination.page === 'legacy') {
      dispatch(resolveLegacy(location.pathname, destination));
    }

    const { routes, selectedRouteId, limit } = getState();
    if (destination.page === 'drive') {
      // a whole drive is its full range once the route is known
      const route = routes?.find((r) => r.log_id === destination.logId);
      const start = destination.start ?? (route ? 0 : null);
      const end = destination.end ?? (route ? route.duration : null);
      dispatch(pushTimelineRange(destination.logId, start, end));
    } else if (selectedRouteId) {
      dispatch(pushTimelineRange(null, null, null));
    }

    if (destination.logId || limit) {
      dispatch(checkRoutesData());
    } else {
      dispatch(checkLastRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }

  const result = next(action); // must be first, otherwise breaks history
  if (action.type === LOCATION_CHANGE) {
    dispatch(syncStateFromUrl(action.payload.location));
  }
  return result;
};
