import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, toPath } from '../url';
import { checkLastRoutesData, checkRoutesData, loadDevice, loadTimelineRange } from './index';
import { api } from '../api/backend';

// url -> state. Every location change (initial load, link, push, replace, back/forward) is parsed
// once here and only what differs from the current state is loaded, so device data, routes and
// playback are reused. Components read the page (prime, stream, settings) from the URL directly.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  next(action); // must be first, otherwise breaks history
  if (action.type !== LOCATION_CHANGE) {
    return;
  }

  const state = getState();
  const { pathname } = action.payload.location;
  const { dongleId, routeId = null, start, end, legacyRange } = parseLocation(pathname);
  const deviceChanged = Boolean(dongleId) && dongleId !== state.dongleId;

  if (deviceChanged) {
    dispatch(loadDevice(dongleId));
  }
  dispatch(loadTimelineRange(routeId, start, end));
  if (deviceChanged) {
    dispatch(checkLastRoutesData());
  } else if (routeId !== state.selectedRouteId) {
    dispatch(checkRoutesData());
  }

  if (legacyRange) {
    // an old link names a time range: look up its drive and replace the link with the drive's URL
    api.routes.getRoutesSegments(dongleId, legacyRange.start, legacyRange.end).then((routes) => {
      if (routes?.length && getState().router.location.pathname === pathname) {
        dispatch(replace(toPath({ dongleId, routeId: routes[0].fullname.split('|')[1] })));
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  }
};
