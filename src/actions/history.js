import { LOCATION_CHANGE } from 'connected-react-router';

import * as Types from './types';
import { parseLocation } from '../url';
import {
  checkRoutesData, resolveLegacyZoom, selectDeviceState, pushTimelineRangeState,
} from './index';

/**
 * The URL is the single source of navigation truth. Every location change
 * (PUSH, POP, REPLACE) is parsed once and diffed against state; only changed
 * slices are dispatched. This middleware never pushes URLs itself, so it
 * cannot loop with the action creators in ./index.
 *
 * Zoom comparison is canonical: state may hold precise millisecond values
 * while URLs carry whole seconds, and a whole-drive zoom serializes without a
 * range. Both normalize to the same form before comparing.
 */
function timelineMatchesState(state, nav) {
  if ((nav.routeId ?? null) !== (state.selectedRouteId ?? null)) {
    return false;
  }
  const zoom = state.zoom;
  const duration = state.currentRoute?.duration;
  const current = !zoom ? null
    : (zoom.start === 0 && duration != null && zoom.end === duration) ? null
    : { start: Math.floor(zoom.start / 1000) * 1000, end: Math.floor(zoom.end / 1000) * 1000 };
  const want = nav.zoom;
  if (!want || !current) {
    return want === current;
  }
  return want.start === current.start && want.end === current.end;
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => async (action) => {
  if (!action) {
    return;
  }

  if (action.type !== LOCATION_CHANGE) {
    next(action);
    return;
  }

  next(action); // must be first, otherwise breaks history

  const nav = parseLocation(action.payload.location);
  if (nav.page === 'unknown') {
    return;
  }

  if (nav.legacy) {
    dispatch(resolveLegacyZoom(nav.dongleId, nav.legacy.start, nav.legacy.end));
    return;
  }

  if (nav.dongleId && nav.dongleId !== getState().dongleId) {
    dispatch(selectDeviceState(nav.dongleId, false));
    dispatch(checkRoutesData());
  }

  if (!timelineMatchesState(getState(), nav)) {
    dispatch(pushTimelineRangeState(nav.routeId, nav.zoom?.start ?? null, nav.zoom?.end ?? null));
  }

  const primeNav = nav.page === 'prime';
  if (primeNav !== getState().primeNav) {
    dispatch({ type: Types.ACTION_PRIME_NAV, primeNav });
  }

  const streamNav = nav.page === 'stream';
  if (streamNav !== getState().streamNav) {
    dispatch({ type: Types.ACTION_STREAM_NAV, streamNav });
  }
};
