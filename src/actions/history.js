import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseLocation, urlFor } from '../url';
import { primeNav, streamNav, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';

// Redirects a legacy timestamp link to the drive it points at, unless the user
// navigated elsewhere while the lookup was running.
function openLegacyLink({ dongleId, range }, key) {
  return (dispatch, getState) => {
    api.routes.getRoutesSegments(dongleId, range.start, range.end).then((routesData) => {
      if (routesData?.length > 0 && getState().router.location.key === key) {
        const logId = routesData[0].fullname.split('|')[1];
        dispatch(replace(urlFor({ page: 'drive', dongleId, logId })));
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };
}

// Makes the state match the URL. Runs for every location change: the initial
// load, links, and browser back/forward. Redirects replace the current entry.
export function applyLocation(location) {
  return (dispatch, getState) => {
    const url = parseLocation(location);
    if (url.page === 'auth') {
      return;
    }

    // `/`, `/demo` and paths without a valid device show the default device.
    // Before the devices load, startup picks it.
    if (url.page === 'home') {
      const { dongleId } = getState();
      if (dongleId) {
        dispatch(replace(urlFor({ page: 'dashboard', dongleId })));
      }
      return;
    }

    const canonical = urlFor({ ...url, settingsDongleId: null });
    if (url.page !== 'legacy' && canonical !== location.pathname) {
      dispatch(replace({ pathname: canonical, search: location.search }));
      return;
    }

    if (url.dongleId && url.dongleId !== getState().dongleId) {
      dispatch(selectDevice(url.dongleId, false, false));
    }

    if (url.page === 'legacy') {
      dispatch(openLegacyLink(url, location.key));
    } else {
      dispatch(selectRoute(url.page === 'drive' ? url.logId : null, url.range));
    }

    if ((url.page === 'prime') !== getState().primeNav) {
      dispatch(primeNav(url.page === 'prime', false));
    }
    if ((url.page === 'stream') !== getState().streamNav) {
      dispatch(streamNav(url.page === 'stream', false));
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action); // must be first, otherwise breaks history
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyLocation(action.payload.location));
  }
  return result;
};
