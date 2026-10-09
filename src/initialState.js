import { applyUrl } from './reducers/location';
import { getDefaultFilter, LIMIT_INCREMENT } from './utils/filter';

export function createInitialState(pathname = window.location.pathname) {
  return applyUrl({
    // set from the url by applyUrl, see src/url.js
    page: null,
    dongleId: null,
    selectedRouteId: null,
    settingsDongleId: null,
    zoom: null,

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
    filesUploading: {},
    filesUploadingMeta: {
      dongleId: null,
      fetchedAt: null,
    },

    filter: getDefaultFilter(),
    loop: null,
    limit: LIMIT_INCREMENT,
  }, { pathname });
}

export default createInitialState();
