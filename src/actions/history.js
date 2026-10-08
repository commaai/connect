import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { buildPath, parsePathname } from '../url';
import {
  checkRoutesData, normalizeDriveRange, primeNav, streamNav, selectDevice, pushTimelineRange,
} from './index';
import { api } from '../api/backend';

let locationRevision = 0;

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE) {
    locationRevision += 1;
    const revision = locationRevision;
    next(action); // must be first, otherwise breaks history

    const pathname = action.payload.location.pathname;
    const location = parsePathname(pathname);
    const state = getState();
    const { dongleId: pathDongleId, page, range, routeId } = location;

    if (pathDongleId && pathDongleId !== state.dongleId) {
      dispatch(selectDevice(pathDongleId, false, false));
    }

    if (page === 'legacy-drive') {
      const { start, end } = range;
      api.routes.getRoutesSegments(pathDongleId, start, end).then((routesData) => {
        if (revision === locationRevision && routesData?.length > 0) {
          const log_id = routesData[0].fullname.split('|')[1];
          // replace so Back does not return to the legacy URL and redirect again
          dispatch(replace(buildPath({ page: 'drive', dongleId: pathDongleId, routeId: log_id })));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }

    const desiredRouteId = page === 'drive' ? routeId : null;
    if (page !== 'legacy-drive') {
      const desiredStart = page === 'drive' ? range?.start ?? null : null;
      const desiredEnd = page === 'drive' ? range?.end ?? null : null;
      if (desiredRouteId !== (state.selectedRouteId ?? null)
        || desiredStart !== (state.zoom?.start ?? null) || desiredEnd !== (state.zoom?.end ?? null)) {
        dispatch(pushTimelineRange(desiredRouteId, desiredStart, desiredEnd, false));
      }
    }

    if ((pathDongleId && desiredRouteId
      && (pathDongleId !== state.dongleId || state.currentRoute?.log_id !== desiredRouteId))
      || ((page === 'dashboard' || page === 'demo') && getState().limit > 0)) {
      // a dashboard reloads its route list if a single drive replaced it
      dispatch(checkRoutesData());
    }

    const pathPrimeNav = page === 'prime';
    if (pathPrimeNav !== state.primeNav) {
      dispatch(primeNav(pathPrimeNav, false));
    }

    const pathStreamNav = page === 'stream';
    if (pathStreamNav !== state.streamNav) {
      dispatch(streamNav(pathStreamNav, false));
    }

    if (page === 'drive' && range) {
      dispatch(normalizeDriveRange());
    }
  } else {
    next(action);
  }
};
