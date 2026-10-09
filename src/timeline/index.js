// The <video> element is the playback clock. Everything that follows playback
// (timeline, map marker, time display) reads the position from here, and every
// seek goes straight to the video. Offsets are milliseconds from route start.
import store from '../store';

let video = null;
let videoStartOffset = 0; // route offset of the first video frame
let lastOffset = 0; // the position to use while the video has none, e.g. still loading

// the selected loop as { start, end }, or null
function getLoop() {
  const { loop } = store.getState();
  if (!loop) {
    return null;
  }
  return { start: loop.startTime, end: loop.startTime + loop.duration };
}

function keepInLoop(offset) {
  const loop = getLoop();
  if (!loop) {
    return offset;
  }
  return Math.min(Math.max(offset, loop.start), loop.end);
}

function videoIsReady() {
  return video !== null && video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

function videoOffset() {
  return videoStartOffset + (video.currentTime * 1000);
}

/**
 * @returns {number} current playback offset in milliseconds from route start
 */
export function currentOffset() {
  if (videoIsReady()) {
    return keepInLoop(videoOffset());
  }
  return keepInLoop(lastOffset);
}

/**
 * Move playback, kept inside the selected loop. Before the video has loaded the
 * offset is remembered and applied as soon as it can be.
 *
 * @param {number} offset milliseconds from route start
 */
export function seek(offset) {
  lastOffset = keepInLoop(offset);
  if (videoIsReady()) {
    video.currentTime = Math.max(0, lastOffset - videoStartOffset) / 1000;
  }
}

function onLoadedMetadata() {
  seek(lastOffset);
}

// while playing, jump back to the start of the loop when it is over
function onTimeUpdate() {
  if (!videoIsReady()) {
    return;
  }
  const loop = getLoop();
  const offset = videoOffset();
  if (loop && !video.paused && (offset < loop.start || offset >= loop.end)) {
    seek(loop.start);
  } else {
    lastOffset = keepInLoop(offset);
  }
}

// the video can end before the loop does
function onEnded() {
  const loop = getLoop();
  if (loop) {
    seek(loop.start);
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
  if (videoIsReady()) {
    seek(lastOffset);
  }
}

export function detachVideo() {
  if (!video) {
    return;
  }
  lastOffset = currentOffset();
  video.removeEventListener('loadedmetadata', onLoadedMetadata);
  video.removeEventListener('timeupdate', onTimeUpdate);
  video.removeEventListener('ended', onEnded);
  video = null;
}
