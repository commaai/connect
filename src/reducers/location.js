import { LOCATION_CHANGE } from 'connected-react-router';

import { reducer as playbackReducer, resetPlayback } from '../timeline/playback';
import { Page, parseLocation } from '../url';
import { emptyDevice } from '../utils';
import { getDefaultFilter, LIMIT_INCREMENT } from '../utils/filter';

const sameRange = (a, b) => a?.start === b?.start && a?.end === b?.end;

// the zoomed range of the selected drive, which is also the playback loop
export function zoomState(zoom) {
  return { zoom, loop: zoom && { startTime: zoom.start, duration: zoom.end - zoom.start } };
}

// everything loaded for one device is dropped when switching to another
function selectDevice(state, dongleId) {
  if (dongleId === state.dongleId) {
    return state;
  }
  return {
    ...state,
    dongleId,
    device: state.devices && (state.devices.find((d) => d.dongle_id === dongleId) || { ...emptyDevice, dongle_id: dongleId }),
    filter: getDefaultFilter(),
    limit: LIMIT_INCREMENT,
    routes: null,
    lastRoutes: null,
    routesMeta: { dongleId: null, start: null, end: null },
    selectedRouteId: null,
    currentRoute: null,
    currentRouteLoading: false,
    subscription: null,
    subscribeInfo: null,
    files: null,
    ...zoomState(null),
  };
}

// each zoom remembers the one it was zoomed in from, so going back steps out one level
function stackZoom(current, range, wholeDrive) {
  if (!range) {
    return null;
  }
  if (sameRange(range, current)) {
    return current;
  }
  if (sameRange(range, current?.previous)) {
    return current.previous;
  }
  const fromWholeDrive = !current || sameRange(current, wholeDrive) || sameRange(range, wholeDrive);
  return { start: range.start, end: range.end, previous: fromWholeDrive ? null : current };
}

// logId null closes the drive, range null shows the whole drive once its duration is known
function selectDrive(state, logId, range) {
  const sameDrive = logId === state.selectedRouteId;
  const currentRoute = (sameDrive && state.currentRoute)
    || (logId && state.routes?.find((route) => route.log_id === logId)) || null;
  const wholeDrive = currentRoute && { start: 0, end: currentRoute.duration };
  const current = sameDrive ? state.zoom : null;
  const zoom = stackZoom(current, range || wholeDrive, wholeDrive);
  if (sameDrive && zoom === current) {
    return state;
  }

  const zoomingIn = current && zoom && zoom.start >= current.start && zoom.end <= current.end;
  const next = {
    ...state,
    selectedRouteId: logId,
    currentRoute,
    currentRouteLoading: Boolean(logId && !currentRoute),
    files: zoomingIn ? state.files : null,
    ...zoomState(zoom),
  };
  // a new selection plays from its start
  return playbackReducer(next, resetPlayback());
}

// url -> state. This is the only place a URL is turned into state, on the first load and on every
// change after it. Only what the URL changes is updated, so everything else is reused.
export default function locationReducer(state, action) {
  if (action.type !== LOCATION_CHANGE) {
    return state;
  }

  // home, referrals and the login page keep the selected device
  const { page, dongleId, logId, range } = parseLocation(action.payload.location);
  if (!dongleId) {
    return state;
  }
  const isDrive = page === Page.DRIVE;
  return selectDrive(selectDevice(state, dongleId), isDrive ? logId : null, isDrive ? range : null);
}
