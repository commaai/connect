import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { drivePath, parseNavigation } from '../url';
import { checkRoutesData, checkLastRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

// History is the sole writer of navigation projections. User actions push a
// location; PUSH, POP, REPLACE and cold entry all take this same path.
export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => {
  let hasLocation = false;
  let legacyRequest = null;
  return (action) => {
    if (!action) return;
    if (action.type !== LOCATION_CHANGE) return next(action);
    const state = getState();
    const previous = hasLocation && state.router?.location && parseNavigation(state.router.location);
    hasLocation = true;
    const navigation = parseNavigation(action.payload.location);
    const result = next(action); // connected-react-router must see the location first
    const deviceChanged = navigation.dongleId && navigation.dongleId !== state.dongleId;
    if (deviceChanged) dispatch(selectDevice(navigation.dongleId, false, false));

    const selectionChanged = deviceChanged || navigation.logId !== state.selectedRouteId
      || (!previous && Boolean(action.payload.location.state?.previousZoom))
      || (previous && (previous.range?.start !== navigation.range?.start || previous.range?.end !== navigation.range?.end));
    if (selectionChanged) {
      dispatch(pushTimelineRange(navigation.logId, navigation.range?.start ?? null, navigation.range?.end ?? null, false, action.payload.location.state?.previousZoom));
    }
    dispatch(primeNav(navigation.page === 'prime', false));
    dispatch(streamNav(navigation.page === 'stream', false));

    if (navigation.legacyRange) {
      const key = JSON.stringify([navigation.dongleId, navigation.legacyRange]);
      if (legacyRequest?.key === key) {
        // Query changes hand ownership to the newest entry without refetching.
        legacyRequest.owner = getState().router.location;
      } else {
        const request = { key, owner: getState().router.location };
        legacyRequest = request;
        api.routes.getRoutesSegments(navigation.dongleId, navigation.legacyRange.start, navigation.legacyRange.end)
          .then((routes) => {
            if (legacyRequest !== request || getState().router.location !== request.owner || !routes?.length) return;
            const route = routes[0];
            const logId = route.fullname.split('|')[1];
            const duration = route.end_time_utc_millis - route.start_time_utc_millis;
            const start = Math.max(0, navigation.legacyRange.start - route.start_time_utc_millis);
            const end = Math.min(duration, navigation.legacyRange.end - route.start_time_utc_millis);
            const validRange = Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start;
            const wholeDrive = !validRange || (start === 0 && end === duration);
            const pathname = drivePath(navigation.dongleId, logId, wholeDrive ? null : start, wholeDrive ? null : end);
            if (parseNavigation(pathname).page === 'drive') dispatch(replace({ ...request.owner, pathname }));
          }).catch((err) => console.error('Error fetching routes data for log ID conversion', err))
          .finally(() => { if (legacyRequest === request) legacyRequest = null; });
      }
    } else {
      legacyRequest = null;
      if (deviceChanged || selectionChanged) {
        dispatch(!navigation.logId && getState().limit === 0 ? checkLastRoutesData() : checkRoutesData());
      }
    }
    return result;
  };
};
