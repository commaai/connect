// The <video> element is the playback clock. Everything that follows playback
// (timeline, map marker, time display) reads the position from here, and every
// seek goes straight to the video. Offsets are milliseconds from route start.
import store from '../store';

let video = null;
let videoStartOffset = 0; // route offset of the first video frame
let pendingOffset = 0; // position to report and restore while the video has none

function loopBounds() {
  const { loop } = store.getState();
  return loop ? [loop.startTime, loop.startTime + loop.duration] : null;
}

function clampToLoop(offset) {
  const bounds = loopBounds();
  return bounds ? Math.min(Math.max(offset, bounds[0]), bounds[1]) : offset;
}

function hasPosition() {
  return video !== null && video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

function videoOffset() {
  return videoStartOffset + (video.currentTime * 1000);
}

/**
 * @returns {number} current playback offset in milliseconds from route start
 */
export function currentOffset() {
  return clampToLoop(hasPosition() ? videoOffset() : pendingOffset);
}

/**
 * Move playback, clamped to the selected loop. Before the video has loaded the
 * offset is kept and applied as soon as it can be.
 *
 * @param {number} offset milliseconds from route start
 */
export function seek(offset) {
  pendingOffset = clampToLoop(offset);
  if (hasPosition()) {
    video.currentTime = Math.max(0, pendingOffset - videoStartOffset) / 1000;
  }
}

function onLoadedMetadata() {
  seek(pendingOffset);
}

// keep playback inside the selected loop, wrapping at its end
function onTimeUpdate() {
  const bounds = loopBounds();
  const offset = videoOffset();
  if (bounds && !video.paused && (offset < bounds[0] || offset >= bounds[1])) {
    seek(bounds[0]);
  }
}

// the loop can end after the video does
function onEnded() {
  const bounds = loopBounds();
  if (bounds) {
    seek(bounds[0]);
    video.play()?.catch(() => {});
  }
}

/**
 * Make a video element the playback clock.
 *
 * @param {HTMLVideoElement} element
 * @param {number} startOffset route offset of the first video frame, in milliseconds
 */
export function attachVideo(element, startOffset = 0) {
  detachVideo();
  video = element;
  videoStartOffset = startOffset;
  video.addEventListener('loadedmetadata', onLoadedMetadata);
  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  if (hasPosition()) {
    seek(pendingOffset);
  }
}

export function detachVideo() {
  if (!video) {
    return;
  }
  pendingOffset = currentOffset();
  video.removeEventListener('loadedmetadata', onLoadedMetadata);
  video.removeEventListener('timeupdate', onTimeUpdate);
  video.removeEventListener('ended', onEnded);
  video = null;
}
