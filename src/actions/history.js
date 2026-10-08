import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parseUrl } from '../url';
import * as Types from './types';
import { checkRoutesData, checkLastRoutesData, setDevice } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { api } from '../api/backend';
import { hardNavigate } from '../utils/navigation';

let legacyLookup = null; // the legacy link being looked up

// A legacy link names a time range; replace it with the drive that contains it,
// unless the user has moved on by the time the lookup returns.
function openLegacyZoom(pathname, dongleId, { start, end }) {
  return (dispatch, getState) => {
    if (legacyLookup === pathname) {
      return;
    }
    legacyLookup = pathname;
    api.routes.getRoutesSegments(dongleId, start, end).then((routesData) => {
      const { location } = getState().router;
      if (location.pathname !== pathname) {
        return;
      }
      if (routesData?.length > 0) {
        dispatch(replace(`/${dongleId}/${routesData[0].fullname.split('|')[1]}${location.search}`));
      } else if (!api.auth.isAuthenticated()) {
        hardNavigate(`/?r=${encodeURI(pathname)}`); // redirect to login
      }
    }).catch((err) => {
      console.error('Error fetching routes data for log ID conversion', err);
    }).finally(() => {
      legacyLookup = null;
    });
  };
}

// Every location change reaches state here. Pages and dialogs are read from the
// URL where they render; the device and drive live in state because selecting
// them loads data. Applying the URL the state already shows changes nothing.
function applyUrl(pathname) {
  return (dispatch, getState) => {
    const url = parseUrl(pathname);
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

    if (url.legacyZoom) {
      dispatch(openLegacyZoom(pathname, url.dongleId, url.legacyZoom));
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
