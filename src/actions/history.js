import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { Page, parseUrl, buildUrl } from '../url';
import { checkLastRoutesData, checkRoutesData, selectDevice, selectDrive } from './index';
import { api } from '../api/backend';

// Every location change, including the initial one, is applied to state here.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action?.type === LOCATION_CHANGE) {
    dispatch(applyUrl(action.payload.location.pathname));
  }
  return result;
};

// Idempotent: applying the same URL twice changes nothing.
export function applyUrl(pathname) {
  return (dispatch, getState) => {
    const { page, dongleId, logId, zoom, legacyRange } = parseUrl(pathname);

    // signed out, App only renders drives, so leaving one only deselects it
    if (!api.auth.isAuthenticated() && page !== Page.DRIVE) {
      dispatch(selectDrive(null, null));
      return;
    }
    if (page === Page.REFERRALS) {
      return;
    }
    if (page === Page.HOME) {
      const { devices } = getState();
      if (devices?.length) {
        const remembered = devices.find((d) => d.dongle_id === window.localStorage.getItem('selectedDongleId'));
        dispatch(replace(buildUrl({ dongleId: (remembered || devices[0]).dongle_id })));
      }
      return;
    }

    if (dongleId !== getState().dongleId) {
      dispatch(selectDevice(dongleId));
    }
    const fetchRoutes = () => dispatch(getState().limit === 0 ? checkLastRoutesData() : checkRoutesData());
    if (legacyRange) {
      // fetch routes only after the lookup, so the resolved drive is fetched on its own
      api.routes.getRoutesSegments(dongleId, legacyRange.start, legacyRange.end).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      }).then((routes) => {
        if (getState().router.location.pathname !== pathname) {
          return;
        }
        if (routes?.length) {
          dispatch(replace(buildUrl({ dongleId, logId: routes[0].fullname.split('|')[1] })));
        } else {
          fetchRoutes();
        }
      });
      return;
    }
    // select the drive first, so a drive that isn't in the first page of routes is fetched on its own
    dispatch(selectDrive(logId, zoom));
    fetchRoutes();
  };
}
