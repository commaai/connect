import { LOCATION_CHANGE, push, replace } from 'connected-react-router';

import { api } from '../api/backend';
import { buildUrl, parseUrl } from '../url';
import { resetPlayback, selectLoop } from '../timeline/playback';
import * as Types from './types';
import { checkLastRoutesData, selectDevice } from './index';

// Navigation flows one way: UI calls navigate(), which changes the URL. Every
// URL change, whether from navigate(), the back button or a typed address, goes
// through applyLocation(), which is the only place a location becomes state.

// Go to a page. Fields left out of `to` fall back to the current device, and to
// nothing for the drive and zoom, e.g. navigate({ page: 'prime' }).
export function navigate(to) {
  return (dispatch, getState) => {
    const state = getState();
    const path = buildUrl({ dongleId: state.dongleId, logId: null, zoom: null, ...to });
    if (path !== state.router.location.pathname) {
      dispatch(push(path));
    }
  };
}

// Old links used absolute timestamps instead of a drive. Find the drive that
// covers the range and swap the URL for its real one.
function resolveLegacyRange({ dongleId, zoom }) {
  return async (dispatch) => {
    try {
      const [route] = await api.routes.getRoutesSegments(dongleId, zoom.start, zoom.end) || [];
      if (route) {
        const logId = route.fullname.split('|')[1];
        dispatch(replace(buildUrl({ page: 'drive', dongleId, logId, zoom: null })));
      }
    } catch (err) {
      console.error('Error fetching routes data for log ID conversion', err);
    }
  };
}

const sameRange = (a, b) => (a?.start ?? null) === (b?.start ?? null) && (a?.end ?? null) === (b?.end ?? null);

export function applyLocation(location) {
  return (dispatch, getState) => {
    const deviceChanged = location.dongleId && location.dongleId !== getState().dongleId;
    if (deviceChanged) {
      dispatch(selectDevice(location.dongleId));
    }

    dispatch({ type: Types.ACTION_NAVIGATE, location });

    // restart playback when the visible range changes
    const { zoom, loop } = getState();
    if (!sameRange(zoom, loop && { start: loop.startTime, end: loop.startTime + loop.duration })) {
      dispatch(resetPlayback());
      dispatch(selectLoop(zoom?.start, zoom?.end));
    }

    // fetch routes after navigating, so a linked drive is requested directly
    if (deviceChanged) {
      dispatch(checkLastRoutesData());
    }

    if (location.page === 'legacyRange') {
      return dispatch(resolveLegacyRange(location));
    }
    return undefined;
  };
}

export const onHistoryMiddleware = ({ dispatch }) => (next) => (action) => {
  const result = next(action);
  if (action?.type === LOCATION_CHANGE) {
    dispatch(applyLocation(parseUrl(action.payload.location.pathname)));
  }
  return result;
};
