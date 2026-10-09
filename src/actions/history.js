import { LOCATION_CHANGE } from 'connected-react-router';
import { destinationFromUrl } from '../url';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type !== LOCATION_CHANGE || !['POP', 'REPLACE'].includes(action.payload.action)) {
    next(action);
    return;
  }

  const state = getState();
  const destination = destinationFromUrl(action.payload.location.pathname);

  next(action); // must be first, otherwise breaks history

  if (destination.kind === 'home' || destination.kind === 'unknown') {
    if (state.selectedRouteId) {
      dispatch(pushTimelineRange(null, null, null, false));
    }
    if (state.primeNav) {
      dispatch(primeNav(false));
    }
    if (state.streamNav) {
      dispatch(streamNav(false, false));
    }
    return;
  }

  const pathDongleId = destination.dongleId;

  if (pathDongleId !== state.dongleId) {
    dispatch(selectDevice(pathDongleId, false, false));
  }

  if (pathDongleId !== state.dongleId) {
    dispatch(checkRoutesData());
  }

  if (destination.kind === 'legacy') {
    api.routes.getRoutesSegments(pathDongleId, destination.start, destination.end)
      .then((routesData) => {
        if (routesData && routesData.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          const duration = routesData[0].end_time_utc_millis - routesData[0].start_time_utc_millis;

          dispatch(pushTimelineRange(log_id, 0, duration, true));
        }
      })
      .catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });

    return;
  }

  if (destination.kind === 'drive') {
    const start = destination.start == null ? null : destination.start * 1000;
    const end = destination.end == null ? null : destination.end * 1000;

    if (
      destination.logId !== state.selectedRouteId ||
      start !== state.zoom?.start ||
      end !== state.zoom?.end
    ) {
      dispatch(pushTimelineRange(destination.logId, start, end, false));
    }
  } else if (state.selectedRouteId) {
    dispatch(pushTimelineRange(null, null, null, false));
  }

  const shouldPrime = destination.kind === 'prime';
  if (shouldPrime !== state.primeNav) {
    dispatch(primeNav(shouldPrime));
  }

  const shouldStream = destination.kind === 'stream';
  if (shouldStream !== state.streamNav) {
    dispatch(streamNav(shouldStream, false));
  }
};