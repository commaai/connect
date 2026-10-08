import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseUrl, urlFor } from '../url';
import { applyDevice, applyTimelineRange, checkRoutesData } from './index';
import { api } from '../api/backend';

// The URL is the source of truth for navigation. Navigation actions only change the URL,
// and every location change is applied to the store here.
function applyUrl(pathname) {
  return (dispatch, getState) => {
    const { dongleId, logId, zoom } = parseUrl(pathname);

    const deviceChanged = dongleId && dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(applyDevice(dongleId, false));
    }

    dispatch(applyTimelineRange(logId, zoom?.start ?? null, zoom?.end ?? null));

    if (deviceChanged) {
      dispatch(checkRoutesData());
    }

    if (zoom && !logId) {
      api.routes.getRoutesSegments(dongleId, zoom.start, zoom.end).then((routesData) => {
        if (routesData?.length > 0 && getState().router.location.pathname === pathname) {
          const routeLogId = routesData[0].fullname.split('|')[1];
          dispatch(replace(urlFor({ dongleId, logId: routeLogId })));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }

  next(action); // must be first, so the router state holds the new location
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
};
