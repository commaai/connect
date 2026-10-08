import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseUrl } from '../url';
import * as Types from './types';
import { checkRoutesData, checkLastRoutesData, setDevice } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { api } from '../api/backend';
import { hardNavigate } from '../utils/navigation';

// A legacy link names a time range; replace it with the drive that contains it,
// unless the user has left the link by the time the lookup returns.
function openLegacyZoom(pathname, dongleId, { start, end }, isCurrent) {
  return (dispatch, getState) => {
    api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
      if (!isCurrent()) {
        return;
      }
      if (routesData?.length > 0) {
        const { search } = getState().router.location;
        dispatch(replace(`/${dongleId}/${routesData[0].fullname.split('|')[1]}${search}`));
      } else if (!api.auth.isAuthenticated()) {
        hardNavigate(`/?r=${encodeURI(pathname)}`); // redirect to login
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    });
  };
}

// Every location change reaches state here. Pages and dialogs are read from the
// URL where they render; the device and drive live in state because selecting
// them loads data. Applying the URL the state already shows changes nothing.
function applyUrl(url) {
  return (dispatch, getState) => {
    const deviceChanged = Boolean(url.dongleId) && url.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(setDevice(url.dongleId));
    }

    const { selectedRouteId, zoom: previousZoom } = getState();
    dispatch({
      type: Types.TIMELINE_PUSH_SELECTION,
      log_id: url.logId,
      start: url.zoom?.start ?? null,
      end: url.zoom?.end ?? null,
    });
    const { zoom } = getState();
    if (zoom !== previousZoom) {
      dispatch(resetPlayback());
      if (zoom) {
        dispatch(selectLoop(zoom.start, zoom.end));
      }
    }

    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    } else if (selectedRouteId !== url.logId) {
      dispatch(checkRoutesData());
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => {
  // this store's visit to a legacy link; a new path, even the same link again,
  // is a new visit, so a lookup from an earlier one is ignored
  let legacyVisit = null;

  return (next) => (action) => {
    if (!action) {
      return undefined;
    }

    const result = next(action);
    if (action.type === LOCATION_CHANGE) {
      const { pathname } = action.payload.location;
      const url = parseUrl(pathname);
      const newVisit = pathname !== legacyVisit?.pathname;
      if (newVisit) {
        legacyVisit = url.legacyZoom && { pathname };
      }
      const visit = legacyVisit;
      dispatch(applyUrl(url));
      if (newVisit && visit) {
        dispatch(openLegacyZoom(pathname, url.dongleId, url.legacyZoom, () => legacyVisit === visit));
      }
    }
    return result;
  };
};
