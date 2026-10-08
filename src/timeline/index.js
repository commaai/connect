import store from '../store';

// The drive's <video> element is the playback clock. The timeline, map and
// time display read the playhead from it and seeks are applied to it, so there
// is no second clock to keep in sync.
//
// Offsets are route offsets in milliseconds. Video time 0 is the route's first
// camera frame, `currentRoute.videoStartOffset` milliseconds into the route.

let video = null;
let pendingOffset = null; // a seek waiting for the video to load its metadata
// a video that failed has no playhead to follow, so until it loads again the
// playhead runs on this clock, and a drive without video still plays on the map
let clock = null; // { offset, time, speed }, speed 0 while paused

function videoStartOffset(state) {
  return state.currentRoute?.videoStartOffset || 0;
}

function canSeek() {
  return video !== null && video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

export function setVideo(element) {
  video = element;
  if (!element) {
    pendingOffset = null;
    clock = null;
  }
}

// the clock starts paused where the failed video stopped
export function setVideoFailed(failed) {
  clock = failed ? { offset: currentOffset(), time: performance.now(), speed: 0 } : null;
}

export function clockSpeed() {
  return clock?.speed ?? null;
}

// plays the clock at a speed, or pauses it at 0. Returns false when the video
// hasn't failed, so there is no clock to run
export function runClock(speed) {
  if (!clock) {
    return false;
  }
  clock = { offset: currentOffset(), time: performance.now(), speed };
  return true;
}

export function getVideo() {
  return video;
}

/**
 * Get current playback offset
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state = store.getState()) {
  if (clock) {
    const { zoom } = state;
    const offset = clock.offset + ((performance.now() - clock.time) * clock.speed);
    // like the video, playback past the end of the range loops
    return zoom && offset >= zoom.end && zoom.end > zoom.start
      ? zoom.start + ((offset - zoom.start) % (zoom.end - zoom.start))
      : offset;
  }
  if (pendingOffset === null && canSeek()) {
    return (video.currentTime * 1000) + videoStartOffset(state);
  }
  return pendingOffset ?? state.zoom?.start ?? 0;
}

export function toVideoTime(offset, state = store.getState()) {
  return Math.max(0, (offset - videoStartOffset(state)) / 1000);
}

// Moves the playhead to an offset within the selected range. Until the video
// can seek, the offset is held: currentOffset reports it and
// applyPendingSeek moves the video there once its metadata loads.
export function seekTo(offset, state = store.getState()) {
  const { zoom } = state;
  if (zoom) {
    offset = Math.min(Math.max(offset, zoom.start), zoom.end);
  }
  if (clock) {
    clock = { ...clock, offset, time: performance.now() };
  }
  if (!canSeek()) {
    pendingOffset = offset;
    return;
  }
  pendingOffset = null;
  video.currentTime = toVideoTime(offset, state);
}

export function applyPendingSeek() {
  if (pendingOffset !== null) {
    seekTo(pendingOffset);
  }
}
