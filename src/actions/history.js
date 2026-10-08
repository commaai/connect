import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { driveUrl, parseUrl, urlFor } from '../url';
import { checkLastRoutesData, selectRoute, setDevice } from './index';
import { api } from '../api/backend';

// Old links address a drive by timestamps; swap them for the drive's own URL.
function resolveLegacyRange(pathname, dongleId, { start, end }) {
  return (dispatch, getState) => {
    api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
      if (routesData && routesData.length > 0 && getState().router.location.pathname === pathname) {
        const logId = routesData[0].fullname.split('|')[1];
        dispatch(replace(urlFor({ dongleId, logId })));
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };
}

// Updates whatever state the URL disagrees with, so navigating reuses everything else.
export function syncStateToUrl(pathname) {
  return (dispatch, getState) => {
    const url = parseUrl(pathname);

    const deviceChanged = url.dongleId && url.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(setDevice(url.dongleId));
    }

    if (url.legacyRange) {
      dispatch(resolveLegacyRange(pathname, url.dongleId, url.legacyRange));
    }

    const state = getState();
    if (driveUrl(state, state.selectedRouteId, state.zoom) !== driveUrl(state, url.logId, url.zoom)) {
      dispatch(selectRoute(url.logId, url.zoom));
    }

    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(syncStateToUrl(action.payload.location.pathname));
  }
  return result;
};
