import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type !== LOCATION_CHANGE) {
    next(action);
    return;
  }

  // connected-react-router must update first. All navigation sources then take
  // this same descriptor-to-state path.
  next(action);

  const { pathname } = action.payload.location;
  const location = parseLocation(pathname);
  let state = getState();
  const deviceChanged = Boolean(location.dongleId && location.dongleId !== state.dongleId);

  if (deviceChanged) {
    dispatch(selectDevice(location.dongleId, false, false));
    state = getState();
  }

  if (location.view === 'legacy-range') {
    const requestedPath = pathname;
    api.routes.getRoutesSegments(location.dongleId, location.start, location.end).then((routesData) => {
      const currentPath = getState().router?.location?.pathname;
      if ((currentPath && currentPath !== requestedPath) || !routesData?.length) return;
      const route = routesData[0];
      const logId = route.fullname.split('|')[1];
      const duration = route.end_time_utc_millis - route.start_time_utc_millis;
      dispatch(pushTimelineRange(logId, 0, duration, true));
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  } else {
    const routeId = location.view === 'drive' ? location.logId : null;
    const start = location.view === 'drive' ? location.startMs : null;
    const end = location.view === 'drive' ? location.endMs : null;
    if (routeId !== state.selectedRouteId
      || (routeId && (state.zoom?.start !== start || state.zoom?.end !== end))) {
      dispatch(pushTimelineRange(routeId, start, end, false));
    }
  }

  const showPrime = location.view === 'prime';
  if (showPrime !== state.primeNav) dispatch(primeNav(showPrime, false));

  const showStream = location.view === 'stream';
  if (showStream !== state.streamNav) dispatch(streamNav(showStream, false));

  if (deviceChanged) dispatch(checkRoutesData());
};
