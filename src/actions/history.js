import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { parse, toUrl } from '../url';
import { applyDevice, checkLastRoutesData, checkRoutesData } from './index';
import { resetPlayback, selectLoop } from '../timeline/playback';
import { api } from '../api/backend';
import * as Types from './types';

// Does a selection (zoom, or null) show the destination's range? No range means the whole drive.
const showsRange = (zoom, { start, end }, duration) => (start == null
  ? !zoom || (zoom.start === 0 && zoom.end === duration)
  : zoom?.start === start && zoom?.end === end);

function resolveLegacy(dest, location) {
  return (dispatch, getState) => api.routes.getRoutesSegments(dest.dongleId, dest.start, dest.end).then((routes) => {
    if (getState().router.location.pathname !== location.pathname) return; // navigated away meanwhile
    if (routes?.length > 0) {
      const log = routes[0].fullname.split('|')[1];
      dispatch(replace(toUrl({ view: 'drive', dongleId: dest.dongleId, log })));
    }
  }).catch((err) => {
    console.error('Error fetching routes data for log ID conversion', err);
  });
}

// The one place redux follows the URL (it never pushes). What each kind of change reuses:
//   device change     -> resets device-scoped state and refetches routes
//   drive/zoom change -> only the selection; routes are reused, files kept when narrowing
//   prime/stream      -> a flag
//   settings/uploads  -> no redux at all, components read them from the URL
export function syncUrl() {
  return (dispatch, getState) => {
    const { location } = getState().router;
    const dest = parse(location);
    if (!dest) return; // unknown URL: leave state alone

    const deviceChanged = dest.dongleId && dest.dongleId !== getState().dongleId;
    if (deviceChanged) dispatch(applyDevice(dest.dongleId, false));
    if (dest.view === 'legacy') {
      if (deviceChanged) dispatch(checkLastRoutesData());
      dispatch(resolveLegacy(dest, location));
      return;
    }

    const state = getState();
    const duration = state.currentRoute?.duration;
    const driveSame = dest.log === state.selectedRouteId && showsRange(state.zoom, dest, duration);
    if (!driveSame) {
      if (dest.log === state.selectedRouteId && state.zoom?.previous && showsRange(state.zoom.previous, dest, duration)) {
        dispatch({ type: Types.TIMELINE_POP_SELECTION }); // browser Back
      } else {
        dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: dest.log, start: dest.start, end: dest.end });
      }
      const { loop } = state;
      const { zoom } = getState(); // the reducer fills in a whole drive's range
      const start = zoom?.start ?? null;
      const end = zoom?.end ?? null;
      if (!loop || !loop.startTime || !loop.duration || loop.startTime < start
        || loop.startTime + loop.duration > end || loop.duration < end - start) {
        dispatch(resetPlayback());
        dispatch(selectLoop(start, end));
      }
    }

    const prime = dest.view === 'prime';
    if (prime !== getState().primeNav) dispatch({ type: Types.ACTION_PRIME_NAV, primeNav: prime });
    const stream = dest.view === 'stream';
    if (stream !== getState().streamNav) dispatch({ type: Types.ACTION_STREAM_NAV, streamNav: stream });

    // last, so a drive opened by URL is fetched even when it is not in the device's list
    if (deviceChanged) dispatch(checkLastRoutesData());
    else if (!driveSame) dispatch(checkRoutesData());
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  if (!action) return undefined;
  const result = next(action);
  if (action.type === LOCATION_CHANGE) dispatch(syncUrl());
  return result;
};
