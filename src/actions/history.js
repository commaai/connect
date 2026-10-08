import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation } from '../url';
import { checkLastRoutesData, navigate, selectDevice, setTimelineRange } from './index';
import { api } from '../api/backend';

// URL -> state. Every location change (links, back/forward, replace) is parsed and
// applied here, after the router has recorded it. Applying a route the store already
// reflects is a no-op, so the initial location (see initialState) costs nothing and
// unchanged device data is reused between pages.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyRoute(parseLocation(action.payload.location)));
  }
  return result;
};

function applyRoute(route) {
  return (dispatch, getState) => {
    const deviceChanged = Boolean(route.dongleId) && route.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(route.dongleId));
    }

    if (route.view === 'legacyRange') {
      dispatch(resolveLegacyRange(route));
    } else if (route.logId || getState().selectedRouteId) {
      dispatch(setTimelineRange(route.logId, route.range));
    }

    // after the timeline is set, so a drive URL fetches its own drive
    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    }
  };
}

// Old links address a drive by absolute time. Look it up and replace the URL with the drive's own.
function resolveLegacyRange({ dongleId, range }) {
  return async (dispatch, getState) => {
    const { pathname } = getState().router.location;
    try {
      const [drive] = (await api.routes.getRoutesSegments(dongleId, range.start, range.end)) || [];
      if (drive && getState().router.location.pathname === pathname) {
        const logId = drive.fullname.split('|')[1];
        dispatch(navigate({ view: 'drive', dongleId, logId }, { replace: true }));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}
