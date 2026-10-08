import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { driveUrl, parseUrl } from '../url';
import { checkRoutesData, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';

// Old links name a drive by its time range. Replace them with the drive's URL,
// or show the drive list when the range has no drive.
function resolveLegacyRange(pathname, dongleId, { start, end }) {
  return (dispatch, getState) => {
    api.routes.getRoutesSegments(dongleId, start, end).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
      return [];
    }).then((routesData) => {
      if (getState().router.location.pathname !== pathname) {
        return;
      }
      if (routesData && routesData.length > 0) {
        const log_id = routesData[0].fullname.split('|')[1];
        dispatch(replace(`/${dongleId}/${log_id}`));
      } else {
        dispatch(checkRoutesData());
      }
    });
  };
}

// Applies a URL to state. Only what differs from state changes, so moving
// between pages keeps the loaded device and drives.
export function syncStateFromUrl(pathname) {
  return (dispatch, getState) => {
    const { dongleId, page, logId, zoom, legacyRange } = parseUrl(pathname);

    // signed out, only drives are public and the login page shows for the rest
    if (!api.auth.isAuthenticated() && !logId && !legacyRange) {
      return;
    }

    // `/`, `/referrals` and unknown URLs pick the remembered device once the
    // device list loads. startup applies the URL again when it does.
    if (!dongleId) {
      const { devices, dongleId: selectedDongleId } = getState();
      const storedDongleId = window.localStorage.getItem('selectedDongleId');
      const device = devices?.find((d) => d.dongle_id === storedDongleId) || devices?.[0];
      if (device && page === 'referrals') {
        // the header and drawer still show a device
        if (!selectedDongleId) {
          dispatch(selectDevice(device.dongle_id));
        }
      } else if (device) {
        dispatch(replace(`/${device.dongle_id}`));
      }
      return;
    }

    if (dongleId !== getState().dongleId) {
      dispatch(selectDevice(dongleId));
    }

    const { currentRoute, selectedRouteId, zoom: shownZoom } = getState();
    if (logId) {
      // skip a drive range that is already shown, such as when coming back from referrals
      if (!currentRoute || driveUrl(currentRoute, shownZoom.start, shownZoom.end) !== pathname) {
        dispatch(selectRoute(logId, zoom?.start, zoom?.end));
      }
    } else if (selectedRouteId) {
      dispatch(selectRoute(null));
    }

    if (legacyRange) {
      dispatch(resolveLegacyRange(pathname, dongleId, legacyRange));
    } else {
      dispatch(checkRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }

  const result = next(action); // must be first, otherwise breaks history
  if (action.type === LOCATION_CHANGE) {
    dispatch(syncStateFromUrl(action.payload.location.pathname));
  }
  return result;
};
