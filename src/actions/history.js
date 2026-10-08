import { LOCATION_CHANGE } from 'connected-react-router';
import { parseLocation, PAGES } from '../url';
import {
  checkRoutesData, primeNav, streamNav, settingsNav, referralsNav, selectDevice, pushTimelineRange,
} from './index';
import { api } from '../api/backend';

// The one place where URLs become state.
//
// Every location change goes through here: the initial load, link clicks,
// back/forward, and programmatic pushes alike. The path is parsed once and
// compared against the current state, and only what actually differs is
// dispatched — so a URL change that doesn't change meaning never touches the
// rest of the state, and a push that was just made to mirror the state is a
// no-op instead of a second round of updates.
//
// The other direction (state -> URL) lives in the navigation actions in
// ./index.js, which push paths built by buildPath()/urlForState().

// Does the timeline state already say what this location says?
function timelineMatchesLocation(state, location) {
  if (state.selectedRouteId !== location.logId) {
    return false;
  }
  if (!location.logId) {
    return true; // dashboard: the timeline is closed either way
  }
  if (location.zoom) {
    // URLs store whole seconds while state keeps the exact milliseconds the
    // user selected, so compare at the precision the URL can express.
    return Boolean(state.zoom)
      && Math.floor(state.zoom.start / 1000) === location.zoom.start / 1000
      && Math.floor(state.zoom.end / 1000) === location.zoom.end / 1000;
  }
  // A drive URL without a range means the whole route: accept an empty
  // selection too, since the routes list may not be loaded to fill it in yet.
  if (!state.zoom) {
    return true;
  }
  return Boolean(state.currentRoute)
    && state.zoom.start === 0
    && state.zoom.end === state.currentRoute.duration;
}

function syncTimeline(dispatch, getState, location) {
  if (timelineMatchesLocation(getState(), location)) {
    return;
  }
  dispatch(pushTimelineRange(
    location.logId,
    location.zoom ? location.zoom.start : null,
    location.zoom ? location.zoom.end : null,
    false, // never write the URL from here: the URL is what we're reading
  ));
}

// Old-style /:dongleId/:start/:end URLs don't name a route: look up the drive
// covering that range and rewrite the URL onto it as a whole-route drive.
function resolveLegacyRange(dispatch, location) {
  const { start, end } = location.legacyRange;
  api.routes.getRoutesSegments(location.dongleId, start, end).then((routesData) => {
    if (routesData && routesData.length > 0) {
      const log_id = routesData[0].fullname.split('|')[1];

      // A null range means "this whole drive", which keeps the rewritten URL
      // stable whether or not the routes list has loaded yet.
      dispatch(pushTimelineRange(log_id, null, null, true));
    }
  }).catch((err) => {
    console.error('Error fetching routes data for log ID conversion', err);
  });
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  next(action); // must be first, otherwise breaks history
  if (action.type !== LOCATION_CHANGE) {
    return;
  }

  const location = parseLocation(action.payload.location.pathname);
  const dongleChanged = Boolean(location.dongleId) && location.dongleId !== getState().dongleId;

  if (dongleChanged) {
    // The first path segment is always the selected device.
    dispatch(selectDevice(location.dongleId, false, false));
  }

  if (location.legacyRange) {
    resolveLegacyRange(dispatch, location);
  }

  syncTimeline(dispatch, getState, location);

  if (dongleChanged) {
    dispatch(checkRoutesData());
  }

  // Which pages are open is exactly what the path says. These run last, after
  // the device switch above, which resets the device-scoped pages as a side
  // effect; `false` keeps them from pushing the path we just read from.
  const state = getState();
  for (const [page, stateKey, sync] of [
    [PAGES.PRIME, 'primeNav', primeNav],
    [PAGES.STREAM, 'streamNav', streamNav],
    [PAGES.SETTINGS, 'settingsNav', settingsNav],
    [PAGES.REFERRALS, 'referralsNav', referralsNav],
  ]) {
    const open = location.page === page;
    if (open !== Boolean(state[stateKey])) {
      dispatch(sync(open, false));
    }
  }
};
