import { getDefaultFilter } from './utils/filter';

export function createInitialState() {
  const filter = getDefaultFilter();
  return {
    dongleId: null,
    routeMetadata: {},

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

    subscription: null,
    subscribeInfo: null,

    files: null,
    uploadQueues: {},

    filter,
    defaultFilter: filter,
    zoom: null,
    loop: null,
    selectedRouteId: null,
    limit: 0,
  };
}

export default createInitialState();
