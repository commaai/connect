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

export function getVideoPlayerCurrentTime(route) {
  const internal = getInternal();
  if (!internal) {
    return null;
  }
  const videoStartOffset = (route && route.videoStartOffset) || 0;
  return internal.currentTime * 1000 + videoStartOffset;
}

export function isVideoPaused() {
  const internal = getInternal();
  if (!internal) {
    return true;
  }
  return internal.paused;
}

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

export function pauseVideo() {
  const internal = getInternal();
  if (!internal) {
    return false;
  }
  internal.pause();
  return true;
}

export function setVideoPlaybackRate(rate) {
  const internal = getInternal();
  if (!internal) {
    return false;
  }
  internal.playbackRate = rate;
  return true;
}
