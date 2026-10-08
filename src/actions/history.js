import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import { parseUrl, deviceUrl, driveUrl, settingsUrl } from '../url';
import { checkLastRoutesData, checkRoutesData, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';

// The URL decides what is on screen. Components navigate by changing it, and
// every location change, including the first one, is applied to state here.

export function navigate(url) {
  return (dispatch, getState) => {
    const { pathname, search } = getState().router.location;
    if (url !== `${pathname}${search}`) {
      dispatch(push(url));
    }
  };
}

export function showSettings(dongleId) {
  return (dispatch, getState) => {
    dispatch(navigate(settingsUrl(getState().router.location, dongleId)));
  };
}

// old links point at a time range instead of a drive, so find the drive and go there instead
function openLegacyRange(dongleId, { start, end }) {
  return async (dispatch) => {
    try {
      const routesData = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routesData && routesData.length > 0) {
        const logId = routesData[0].fullname.split('|')[1];
        dispatch(replace(driveUrl(dongleId, logId)));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// Make state match the URL. Whatever the URL doesn't change is kept.
export function applyUrl(location) {
  return (dispatch, getState) => {
    const url = parseUrl(location);
    const state = getState();

    if (url.page === 'home') {
      // before a device is selected, init() applies the URL again
      if (state.dongleId) {
        dispatch(replace(deviceUrl(state.dongleId)));
      }
      return;
    }

    const deviceChanged = url.dongleId && url.dongleId !== state.dongleId;
    const routeChanged = url.logId !== state.selectedRouteId;
    if (deviceChanged) {
      dispatch(selectDevice(url.dongleId));
    }
    dispatch(selectRoute(url.logId, url.zoom));

    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    } else if (routeChanged) {
      dispatch(checkRoutesData());
    }

    if (url.legacyRange) {
      dispatch(openLegacyRange(url.dongleId, url.legacyRange));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action); // the router state has to update first
  if (action?.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location));
  }
  return result;
};
