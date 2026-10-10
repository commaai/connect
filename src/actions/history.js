import { CALL_HISTORY_METHOD, LOCATION_CHANGE, replace } from 'connected-react-router';
import { createPath } from 'history';
import { parseUrl } from '../url';
import { pushTimelineRange, selectDevice } from './index';
import { api } from '../api/backend';

// url -> state: navigation only changes the url, this applies it.
// pages (prime, stream) and ?settings are read from the url where they are rendered
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  // going to the url you are already on would only add a history entry
  if (action.type === CALL_HISTORY_METHOD && action.payload.args[0] === createPath(getState().router.location)) {
    return;
  }

  next(action); // must come before the dispatches below, otherwise breaks history
  if (action.type !== LOCATION_CHANGE) {
    return;
  }

  const state = getState();
  const { pathname } = action.payload.location;
  const { dongleId, routeId, zoom, legacyZoom } = parseUrl(pathname);

  if (dongleId && dongleId !== state.dongleId) {
    dispatch(selectDevice(dongleId));
  }

  if (routeId || state.selectedRouteId) {
    dispatch(pushTimelineRange(routeId ?? null, zoom?.start ?? null, zoom?.end ?? null));
  }

  if (legacyZoom) {
    api.routes.getRoutesSegments(dongleId, legacyZoom.start, legacyZoom.end).then((routesData) => {
      if (routesData?.length && getState().router.location.pathname === pathname) {
        const log_id = routesData[0].fullname.split('|')[1];
        dispatch(replace(`/${dongleId}/${log_id}`));
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  }
};
