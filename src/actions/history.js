import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { pageAt, urlFor } from '../url';
import { api } from '../api/backend';
import { checkLastRoutesData, selectDevice, selectDrive } from './index';

// The URL decides what is on screen. Every location change, whether from a
// click, the back button or an address typed by hand, is applied here.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location));
  }
  return result;
};

// Changes only what differs from the URL, so the device, its drives and the
// video already loaded are kept across navigations.
function applyUrl(location) {
  return (dispatch, getState) => {
    const { page, dongleId, logId = null, zoom = null, startTime, endTime } = pageAt(location);

    const deviceChanged = Boolean(dongleId) && dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(dongleId, false));
    }
    dispatch(selectDrive(logId, zoom));
    // After the drive is selected, so it is fetched even if it is not recent.
    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    }

    if (page === 'timeRange') {
      dispatch(redirectToDrive(dongleId, startTime, endTime));
    }
  };
}

function redirectToDrive(dongleId, startTime, endTime) {
  return async (dispatch) => {
    try {
      const [route] = await api.routes.getRoutesSegments(dongleId, startTime, endTime) || [];
      if (route) {
        dispatch(replace(urlFor('drive', { dongleId, logId: route.fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}
