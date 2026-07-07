// direct access to the video player instance, so the timeline can seek
// without going through global state
let videoPlayer = null;

export function setVideoPlayer(player) {
  videoPlayer = player;
}

function getInternal() {
  if (!videoPlayer || !videoPlayer.getInternalPlayer) {
    return null;
  }
  return videoPlayer.getInternalPlayer();
}

/**
 * Seek the video player directly to a route offset.
 * @param {number} offset - route offset in milliseconds
 * @param {object} [route] - current route (for videoStartOffset conversion)
 * @returns {boolean} true if the seek was performed
 */
export function seekVideoPlayer(offset, route) {
  if (!videoPlayer || !videoPlayer.getInternalPlayer || !videoPlayer.getDuration()) {
    return false;
  }

  let videoTime = offset;
  if (route && route.videoStartOffset) {
    videoTime -= route.videoStartOffset;
  }
  videoTime = Math.max(0, videoTime / 1000);

  videoPlayer.seekTo(videoTime, 'seconds');
  return true;
}

/**
 * Check if the video player is currently paused.
 * @returns {boolean} true if the video player is paused (or unavailable)
 */
export function isVideoPaused() {
  const internal = getInternal();
  if (!internal) {
    return true;
  }
  return internal.paused;
}

/**
 * Start playback on the video player directly.
 * @returns {boolean} true if play was called
 */
export function playVideo() {
  const internal = getInternal();
  if (!internal) {
    return false;
  }
  const promise = internal.play();
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
  return true;
}

/**
 * Pause the video player directly.
 * @returns {boolean} true if pause was called
 */
export function pauseVideo() {
  const internal = getInternal();
  if (!internal) {
    return false;
  }
  internal.pause();
  return true;
}

/**
 * Set the playback rate on the video player directly.
 * @param {number} rate - desired playback rate
 * @returns {boolean} true if the rate was set
 */
export function setVideoPlaybackRate(rate) {
  const internal = getInternal();
  if (!internal) {
    return false;
  }
  internal.playbackRate = rate;
  return true;
}
