import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { buildUrl, parseUrl } from '../url';
import { checkRoutesData, selectDevice, selectRoute } from './index';
import { api } from '../api/backend';

// Legacy URLs point at a time range. Replace them with the drive at its start.
function resolveLegacyRange(dongleId, { start, end }) {
  return (dispatch) => api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
    if (routesData && routesData.length > 0) {
      const logId = routesData[0].fullname.split('|')[1];
      dispatch(replace(buildUrl({ dongleId, logId })));
    }
  }).catch((err) => {
    console.error('Error fetching routes data for log ID conversion', err);
  });
}

// Bring the store in line with the URL, keeping whatever state still applies.
export function applyUrl({ dongleId, logId, zoom, legacyRange }) {
  return (dispatch, getState) => {
    if (legacyRange) {
      dispatch(resolveLegacyRange(dongleId, legacyRange));
      return;
    }

    if (dongleId && dongleId !== getState().dongleId) {
      dispatch(selectDevice(dongleId));
    }
    dispatch(selectRoute(logId, zoom));
    dispatch(checkRoutesData());
  };
}

// Every URL change goes through here: links, navigate() and the browser's
// back and forward buttons. The initial URL is already in the initial state.
export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return undefined;
  }

  const result = next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyUrl(parseUrl(action.payload.location.pathname)));
  }
  return result;
};
