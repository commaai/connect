import { LOCATION_CHANGE } from 'connected-react-router';
import { getDongleID, getZoom, getSegmentRange, getPrimeNav } from '../url';
import { primeNav, selectDevice, pushTimelineRange, updateSegmentRange } from './index';
import { drives as Drives } from '@commaai/api';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const state = getState();

    next(action); // must be first, otherwise breaks history

    const pathDongleId = getDongleID(action.payload.location.pathname);
    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false));
    }

    const pathZoom = getZoom(action.payload.location.pathname);
    const pathSegmentRange = getSegmentRange(action.payload.location.pathname);

    if ((pathZoom !== state.zoom) && pathZoom && !pathSegmentRange) {
      const [start, end] = [pathZoom.start, pathZoom.end];

      Drives.getRoutesSegments(pathDongleId, start, end).then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1]; 
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, null, null, true));
          dispatch(updateSegmentRange(log_id, 0, duration));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    
    if (pathSegmentRange !== state.segmentRange) {
      dispatch(pushTimelineRange(pathSegmentRange?.log_id, pathSegmentRange?.start, pathSegmentRange?.end, false));
    }

    const pathPrimeNav = getPrimeNav(action.payload.location.pathname);
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav));
    }
  } else {
    next(action);
  }
};
