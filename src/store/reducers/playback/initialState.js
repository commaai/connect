import { getZoom } from '../../../url';

const getDefaultLoop = (pathname) => {
  // in time instead of offset
  // this makes it so that the timespan can change without this changing
  // that's helpful to shared links and other things probably...
  const zoom = getZoom(pathname);
  if (zoom) {
    return {
      startTime: zoom.start,
      duration: zoom.end - zoom.start,
    };
  }
  return null;
};

export default {
  desiredPlaySpeed: 1, // speed set by user
  isBufferingVideo: true, // if we're currently buffering for more data
  offset: null, // in milliseconds, relative to `state.filter.start`
  startTime: Date.now(), // millisecond timestamp in which play began

  zoom: getZoom(window.location.pathname),
  loop: getDefaultLoop(window.location.pathname),
};
