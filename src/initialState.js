import { parsePath, secToMs } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  // Single canonical parse of the cold-entry URL. Values below match the
  // previous per-helper derivation exactly for all supported shapes; the
  // legacy timestamp range intentionally seeds no zoom/selection here and
  // resolves asynchronously through the history middleware instead.
  const parsed = parsePath(pathname);
  const isDriveRange = parsed.kind === 'driveRange';
  const isWholeDrive = parsed.kind === 'drive';
  return {
    dongleId: parsed.dongleId,

    desiredPlaySpeed: 1,    // speed set by user
    isBufferingVideo: true, // if we're currently buffering for more data
    offset: null,           // in miliseconds, relative to state.zoom.start
    startTime: Date.now(),  // millisecond timestamp in which play began

    routes: null,
    routesMeta: {
      dongleId: null,
      start: null,
      end: null,
    },
    currentRoute: null,
    lastRoutes: null,

    profile: null,
    devices: null,

    primeNav: parsed.kind === 'prime',
    streamNav: parsed.kind === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: isDriveRange ? { start: secToMs(parsed.startSec), end: secToMs(parsed.endSec) } : null,
    loop: null,
    selectedRouteId: (isWholeDrive || isDriveRange) ? parsed.logId : null,
    limit: 0,
  };
}

export default createInitialState();
