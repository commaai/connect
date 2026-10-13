import { parse } from './url';
import { getDefaultFilter } from './utils/filter';

export function createInitialState(location = window.location) {
  const dest = parse(location) ?? {};
  const inDrive = dest.view === 'drive';
  return {
    dongleId: dest.dongleId ?? null,

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

    primeNav: dest.view === 'prime',
    streamNav: dest.view === 'stream',
    subscription: null,
    subscribeInfo: null,

    files: null,
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    zoom: inDrive && dest.start != null ? { start: dest.start, end: dest.end } : null,
    loop: null,
    selectedRouteId: inDrive ? dest.log : null,
    limit: 0,
  };
}

export default createInitialState();
