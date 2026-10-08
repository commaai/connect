import store from '../store';

let activeVideoElement = null;
let activeRoute = null;

export const videoController = {
  setVideoElement(element, route = null) {
    activeVideoElement = element;
    if (route) activeRoute = route;
  },
  setRoute(route) {
    activeRoute = route;
  },
  getVideoElement: () => activeVideoElement,
  hasActiveVideo: () => Boolean(activeVideoElement && (activeVideoElement.readyState >= 1 || activeVideoElement.currentTime > 0)),
  getCurrentTime: () => (activeVideoElement ? activeVideoElement.currentTime : 0),
  getCurrentOffset(state = null) {
    if (!activeVideoElement) return null;
    const route = activeRoute || (state || store.getState())?.currentRoute;
    return (activeVideoElement.currentTime * 1000) + (route?.videoStartOffset || 0);
  },
  seek(offset, route = null) {
    if (!activeVideoElement) return null;
    const vOffset = (route || activeRoute)?.videoStartOffset || 0;
    const target = Math.max(0, (offset - vOffset) / 1000);
    if (activeVideoElement.readyState >= 1) activeVideoElement.currentTime = target;
    return target;
  },
  clear() {
    activeVideoElement = null;
    activeRoute = null;
  },
};

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = null) {
  state = state || store.getState();
  let offset = videoController.hasActiveVideo() ? videoController.getCurrentOffset(state) : null;
  if (offset === null) {
    if (state.offset === null && state.loop?.startTime) {
      offset = state.loop.startTime;
    } else {
      const playSpeed = state.isBufferingVideo ? 0 : (state.desiredPlaySpeed || 0);
      offset = (state.offset || 0) + (state.startTime ? (Date.now() - state.startTime) * playSpeed : 0);
    }
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}