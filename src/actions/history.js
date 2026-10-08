import { LOCATION_CHANGE, push, replace } from 'connected-react-router';
import { isPublic, parseLocation, urlFor } from '../url';
import { checkLastRoutesData, checkRoutesData, selectDevice, selectDrive } from './index';
import { api } from '../api/backend';

// The URL says where the app is: components navigate, and syncLocation turns the URL into state.
export function navigate(location) {
  return (dispatch, getState) => {
    const state = getState();
    const url = urlFor({ dongleId: state.dongleId, ...location });
    if (url !== state.router.location.pathname) {
      dispatch(push(url));
    }
  };
}

function resolveLegacyUrl(pathname, { dongleId, start, end }) {
  return async (dispatch, getState) => {
    try {
      const routes = await api.routes.getRoutesSegments(dongleId, start, end);
      const logId = routes?.[0]?.fullname.split('|')[1];
      if (logId && getState().router.location.pathname === pathname) {
        dispatch(replace(urlFor({ page: 'drive', dongleId, logId })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

// Only what the URL changes is touched, so moving between pages of one device keeps its
// routes, files and subscription.
export function syncLocation(pathname) {
  return (dispatch, getState) => {
    const location = parseLocation(pathname);
    if (!location.dongleId || (!api.auth.isAuthenticated() && !isPublic(location))) {
      return;
    }

    if (location.dongleId !== getState().dongleId) {
      dispatch(selectDevice(location.dongleId));
    }

    if (location.page === 'legacy') {
      dispatch(resolveLegacyUrl(pathname, location));
    }

    dispatch(selectDrive(location.logId ?? null, location.zoom ?? null));
    if (location.page === 'drive') {
      dispatch(checkRoutesData());
    } else if (getState().limit === 0) {
      dispatch(checkLastRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(syncLocation(action.payload.location.pathname));
  }
  return result;
};
