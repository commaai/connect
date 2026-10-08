import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { Page, parseUrl, deviceUrl, driveUrl } from '../url';
import { checkLastRoutesData, checkRoutesData, selectDevice, selectDrive } from './index';
import { api } from '../api/backend';

// The URL is the source of truth for what is on screen. Components navigate by
// changing the URL, and every location change (including the first page load) is applied here.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
  return result;
};

// url -> state, top to bottom. Each step only changes what differs from the
// current state, so applying the same URL twice changes nothing the second time.
export const applyUrl = (pathname) => (dispatch, getState) => {
  const { page, dongleId, logId, zoom, legacyRange } = parseUrl(pathname);

  // `/` opens the last selected device, once the device list has loaded
  if (page === Page.HOME) {
    const { devices } = getState();
    if (devices?.length) {
      const lastDongleId = window.localStorage.getItem('selectedDongleId');
      const device = devices.find((d) => d.dongle_id === lastDongleId) || devices[0];
      dispatch(replace(deviceUrl(device.dongle_id)));
    }
    return;
  }
  if (!dongleId) {
    return;
  }

  if (dongleId !== getState().dongleId) {
    dispatch(selectDevice(dongleId));
  }
  if (legacyRange) {
    dispatch(openLegacyRange(pathname, dongleId, legacyRange));
  }
  dispatch(selectDrive(logId, zoom));

  // the first visit to a device loads its drive list, later visits reuse it
  const firstVisit = getState().limit === 0;
  dispatch(firstVisit ? checkLastRoutesData() : checkRoutesData());
};

// legacy links point at a time range, replace them with the drive at that time.
// The lookup is async, so its answer is dropped if the user navigated away meanwhile.
const openLegacyRange = (pathname, dongleId, { start, end }) => async (dispatch, getState) => {
  try {
    const routes = await api.routes.getRoutesSegments(dongleId, start, end);
    const logId = routes?.[0]?.fullname.split('|')[1];
    if (logId && getState().router.location.pathname === pathname) {
      dispatch(replace(driveUrl(dongleId, logId)));
    }
  } catch (err) {
    console.error('Error fetching routes data for log ID conversion', err);
  }
};
