import { LOCATION_CHANGE, replace } from 'connected-react-router';
import { build, parse } from '../location';
import { checkRoutesData, primeNav, streamNav, selectDevice, pushTimelineRange } from './index';
import { api } from '../api/backend';

let legacyGeneration = 0;

export function resetLegacyGeneration() {
  legacyGeneration = 0;
}

function isStillWatching(getState, generation, watched) {
  if (generation !== legacyGeneration) return false;
  const current = parse(getState().router.location);
  return current.kind === 'legacy' && build(current).pathname === watched;
}

// A pre-redesign URL spells a unix-millisecond range. Ask the API which route
// covers it and replace the entry with that route's URL, so Back skips the
// legacy format instead of converting it again. A response that arrives after
// the user navigated elsewhere is dropped.
function resolveLegacy(dispatch, getState, location) {
  legacyGeneration += 1;
  const generation = legacyGeneration;
  const watched = build(location).pathname;

  api.routes.getRoutesSegments(location.dongleId, location.startMs, location.endMs)
    .then((routes) => {
      if (!isStillWatching(getState, generation, watched)) {
        console.debug('dropped stale legacy response', watched);
        return;
      }
      if (!routes || routes.length === 0) return;
      const logId = routes[0].fullname.split('|')[1];
      dispatch(replace(build({
        kind: 'drive',
        dongleId: location.dongleId,
        logId,
        zoom: null,
        query: {},
        passthrough: location.passthrough,
      })));
    })
    .catch((err) => {
      if (!isStillWatching(getState, generation, watched)) {
        console.debug('dropped stale legacy rejection', watched);
        return;
      }
      console.error('Error fetching routes data for log ID conversion', err);
    });
}

export const onHistoryMiddleware = ({ dispatch, getState }) => (next) => (action) => {
  if (!action) {
    return;
  }

  if (action.type === LOCATION_CHANGE && ['POP', 'REPLACE'].includes(action.payload.action)) {
    const prev = getState();

    next(action); // must be first, otherwise breaks history

    const location = parse(action.payload.location);

    if (location.dongleId && location.dongleId !== prev.dongleId) {
      dispatch(selectDevice(location.dongleId, false, false));
    }

    if (location.kind === 'legacy') {
      resolveLegacy(dispatch, getState, location);
      if (prev.selectedRouteId && prev.dongleId === location.dongleId) {
        dispatch(pushTimelineRange(null, null, null, false)); // selectDevice cleared it on a dongle change
      }
    } else if (location.kind === 'drive' || prev.selectedRouteId) {
      const zoom = location.kind === 'drive' ? location.zoom : null;
      dispatch(pushTimelineRange(
        location.kind === 'drive' ? location.logId : null,
        zoom ? zoom.start : null,
        zoom ? zoom.end : null,
        false,
      ));
    }

    if (location.dongleId && location.dongleId !== prev.dongleId) {
      dispatch(checkRoutesData());
    }

    if ((location.kind === 'prime') !== prev.primeNav) {
      // flag only: the URL already says where the user is going
      dispatch(primeNav(location.kind === 'prime', false));
    }

    if ((location.kind === 'stream') !== prev.streamNav) {
      dispatch(streamNav(location.kind === 'stream', false));
    }
  } else {
    return next(action); // PUSH is still ignored: thunks own those writes
  }
};
