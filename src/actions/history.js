import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { parseUrl, urlFor } from '../url';
import { checkRoutesData, selectDevice, selectDrive } from './index';

// Legacy links name a time range instead of a drive. Look the drive up and
// replace the URL, so going back doesn't land on the legacy link again.
function replaceLegacyUrl(pathname, dongleId, { start, end }) {
  return async (dispatch, getState) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      if (routes?.length && getState().router.location.pathname === pathname) {
        dispatch(replace(urlFor({ dongleId, logId: routes[0].fullname.split('|')[1] })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// URL -> state. Runs for every location change: the first load, links,
// back/forward and redirects. Pages need no state, components read them from
// the URL. Everything else the URL points at is applied here, and whatever
// already matches is kept: the device's drives, the open drive, its files.
export function applyUrl(pathname) {
  return (dispatch, getState) => {
    const { page, dongleId, logId, zoom } = parseUrl(pathname);

    if (dongleId && dongleId !== getState().dongleId) {
      dispatch(selectDevice(dongleId));
    }
    dispatch(selectDrive(logId, logId ? zoom : null));
    if (page === 'legacy') {
      dispatch(replaceLegacyUrl(pathname, dongleId, zoom));
    }
    dispatch(checkRoutesData());
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action?.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
  return result;
};
