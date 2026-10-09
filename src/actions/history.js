import { LOCATION_CHANGE } from 'connected-react-router';
import { parsePath } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const {
      dongleId: pathDongleId, routeId: pathRouteId, zoom: pathRouteZoom, legacyZoom: pathZoom, page,
    } = parsePath(action.payload.location.pathname);
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false, false));
    }

    if (pathZoom) {
      const [start, end] = [pathZoom.start, pathZoom.end];

      api.routes.getRoutesSegments(pathDongleId, start, end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1]; 
          dispatch(pushTimelineRange(log_id, null, null, true));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    
    if (pathRouteId || state.selectedRouteId) {
      dispatch(pushTimelineRange(pathRouteId, pathRouteZoom?.start ?? null, pathRouteZoom?.end ?? null, false));
    }

    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(checkRoutesData());
    }

    const pathPrimeNav = page === 'prime';
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }

    const pathStreamNav = page === 'stream';
    if (pathStreamNav !== state.streamNav) {
      dispatch(streamNav(pathStreamNav, false));
    }
  } else {
    next(action);
  }
};
