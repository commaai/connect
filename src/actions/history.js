import { LOCATION_CHANGE, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { parsePath, pathFor } from '../url';
import { applyDevice } from './index';
import * as Types from './types';

// A URL leaves out the range of a whole route.
function sameZoom(a, b, route) {
  const isWhole = (zoom) => !zoom || (zoom.start === 0 && zoom.end === route?.duration);
  return isWhole(a) ? isWhole(b) : a.start === b?.start && a.end === b?.end;
}

// Restart playback on a new range, unless the loop already plays it.
function updateLoop(dispatch, loop, zoom) {
  if (!loop?.startTime || !loop.duration || !zoom || loop.startTime < zoom.start
    || loop.startTime + loop.duration > zoom.end || loop.duration < zoom.end - zoom.start) {
    dispatch(resetPlayback());
    dispatch(selectLoop(zoom?.start, zoom?.end));
  }
}

// URL -> state. Every location change comes through here, and only the parts
// of the state that the URL changed are touched.
function applyPath(pathname) {
  return (dispatch, getState) => {
    const { dongleId, routeId, zoom, page, legacyZoom } = parsePath(pathname);
    const state = getState();

    if (routeId !== state.selectedRouteId || !sameZoom(zoom, state.zoom, state.currentRoute)) {
      const back = routeId === state.selectedRouteId && state.zoom?.previous
        && sameZoom(zoom, state.zoom.previous, state.currentRoute);
      dispatch(back
        ? { type: Types.TIMELINE_POP_SELECTION }
        : { type: Types.TIMELINE_PUSH_SELECTION, log_id: routeId, start: zoom?.start, end: zoom?.end });
      updateLoop(dispatch, state.loop, getState().zoom);
    }

    if (dongleId && dongleId !== state.dongleId) {
      dispatch(applyDevice(dongleId));
    }

    const { primeNav, streamNav } = getState();
    if ((page === 'prime') !== primeNav) {
      dispatch({ type: Types.ACTION_PRIME_NAV, primeNav: page === 'prime' });
    }
    if ((page === 'stream') !== streamNav) {
      dispatch({ type: Types.ACTION_STREAM_NAV, streamNav: page === 'stream' });
    }

    if (legacyZoom) {
      api.routes.getRoutesSegments(dongleId, legacyZoom.start, legacyZoom.end).then((routes) => {
        if (routes?.length) {
          dispatch(replace(pathFor({ dongleId, routeId: routes[0].fullname.split('|')[1] })));
        }
      }).catch((err) => {
        console.error('Error fetching routes data for log ID conversion', err);
      });
    }
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) {
    return;
  }
  next(action);
  if (action.type === LOCATION_CHANGE) {
    dispatch(applyPath(action.payload.location.pathname));
  }
};
