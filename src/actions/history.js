import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { buildUrl, parseUrl } from '../url';
import { checkLastRoutesData, selectDevice, selectTimelineRange } from './index';
import { api } from '../api/backend';

// Old links address a drive by absolute timestamps. Look up the drive and replace the URL with it.
function redirectLegacyRange(pathname, dongleId, { start, end }) {
  return (dispatch, getState) => {
    api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
      if (routesData?.length > 0 && getState().router.location.pathname === pathname) {
        const logId = routesData[0].fullname.split('|')[1];
        dispatch(replace(buildUrl({ dongleId, logId })));
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };
}

// URL -> state. Pages without data (Prime, stream, settings, referrals) are read
// straight from the URL by components; this only syncs the device and drive,
// dispatching nothing for what already matches.
function applyUrl(pathname) {
  return (dispatch, getState) => {
    const { dongleId, logId, zoom, legacyRange } = parseUrl(pathname);
    const deviceChanged = dongleId && dongleId !== getState().dongleId;

    if (deviceChanged) {
      dispatch(selectDevice(dongleId, false));
    }
    dispatch(selectTimelineRange(logId, zoom));
    if (deviceChanged) {
      // fetch after selecting the drive, so a drive outside the recent routes is fetched directly
      dispatch(checkLastRoutesData());
    }
    if (legacyRange) {
      dispatch(redirectLegacyRange(pathname, dongleId, legacyRange));
    }
  };
}

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
