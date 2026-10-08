import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { Page, parseUrl, deviceUrl, driveUrl } from '../url';
import { checkRoutesData, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';

// `/` shows the last selected device, or the first one
export function homeDongleId(devices) {
  const selectedDongleId = window.localStorage.getItem('selectedDongleId');
  return devices.some((device) => device.dongle_id === selectedDongleId) ? selectedDongleId : devices[0].dongle_id;
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
export function applyUrl(pathname) {
  return (dispatch, getState) => {
    const { page, dongleId, logId, zoom, legacyRange } = parseUrl(pathname);
    const state = getState();

    if (page === Page.HOME) {
      // before the device list loads, init() does this
      if (state.devices?.length) {
        dispatch(replace(deviceUrl(homeDongleId(state.devices))));
      }
      return;
    }

    if (dongleId && dongleId !== state.dongleId) {
      dispatch(selectDevice(dongleId));
    }
    if (legacyRange) {
      dispatch(openLegacyRange(dongleId, legacyRange));
    }
    dispatch(selectRoute(logId, zoom));
    dispatch(checkRoutesData());
  };
}

// The URL decides what is on screen. Components navigate by changing it, and
// every location change, including the first one, is applied to state here.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action); // the router state has to update first
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
  return result;
};
