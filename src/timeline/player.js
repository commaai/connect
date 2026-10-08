// The video element is the playback clock. The current position is always read
// back from the video; seeking, playing and speed changes are applied to it.
// Until a video has loaded (or when it can't load), the last known position is
// kept so the timeline and map still show and seek to the right place.
import { routeToVideoTime, videoToRouteTime } from './videoTime';

const HAVE_NOTHING = 0;
const HAVE_METADATA = 1;

let video = null;
let onChange = null;
let loaded = false;       // the video's position has been set up for the current source
let offset = 0;           // route offset in ms, last known position
let videoStartOffset = 0; // route offset in ms of the first video frame
let segments = null;      // uploaded segments in the video, see ./videoTime
let loop = null;          // { startTime, duration } in route offset ms
let wantPlaying = true;
let playSpeed = 1;
let loopFrame = null;

// readyState rises before the loadedmetadata event is delivered; until that
// event is handled, the video's position isn't the playback position yet
function isReady() {
  return Boolean(video) && loaded;
}

function loopEnd() {
  return loop.startTime + loop.duration;
}

function clampToLoop(value) {
  if (!loop) {
    return value;
  }
  return Math.min(Math.max(value, loop.startTime), loopEnd());
}

function setWantPlaying(value) {
  if (wantPlaying !== value) {
    wantPlaying = value;
    onChange?.();
  }
}

function applyPlayState() {
  if (!video) {
    return;
  }
  video.defaultPlaybackRate = playSpeed;
  video.playbackRate = playSpeed;
  if (!wantPlaying) {
    video.pause();
    return;
  }
  const result = video.play();
  if (result) {
    result.catch((err) => {
      // the browser refused to start playback (e.g. autoplay with sound), stay paused
      if (err.name === 'NotAllowedError') {
        setWantPlaying(false);
      }
    });
  }
}

export function getOffset() {
  if (isReady()) {
    offset = (videoToRouteTime(segments, video.currentTime) * 1000) + videoStartOffset;
  }
  return offset;
}

export function getVideoTime() {
  return routeToVideoTime(segments, Math.max(0, (offset - videoStartOffset) / 1000));
}

export function seek(value) {
  offset = clampToLoop(value);
  if (isReady()) {
    video.currentTime = getVideoTime();
  }
}

export function isPlaying() {
  return wantPlaying;
}

export function play() {
  setWantPlaying(true);
  applyPlayState();
}

export function pause() {
  setWantPlaying(false);
  applyPlayState();
}

export function setPlaySpeed(speed) {
  playSpeed = speed;
  if (video) {
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
  }
}

function watchLoop() {
  loopFrame = null;
  if (!video || video.paused || !loop) {
    return;
  }
  if (getOffset() >= loopEnd()) {
    seek(loop.startTime);
  }
  loopFrame = requestAnimationFrame(watchLoop);
}

function startLoopWatch() {
  if (!loopFrame && loop && video && !video.paused) {
    loopFrame = requestAnimationFrame(watchLoop);
  }
}

// Restrict playback to a section of the route and start from its beginning.
export function setLoop(start, end) {
  loop = (start != null && end != null) ? { startTime: start, duration: end - start } : null;
  if (loop) {
    seek(loop.startTime);
    startLoopWatch();
  }
}

// Segments the video skips because they were never uploaded, from the playlist.
export function setSegments(value) {
  segments = value;
}

// Call before the video's source is torn down (reload, another route): the
// element resets its position right away, before it reports being emptied.
export function releaseSource() {
  getOffset();
  loaded = false;
}

// The route offset of the first video frame is only known once the route's
// events have loaded; the video keeps playing, only its position on the route moves.
export function setVideoStartOffset(value) {
  videoStartOffset = value;
}

function onLoadedMetadata() {
  video.currentTime = getVideoTime();
  loaded = true;
  applyPlayState();
}

function onEmptied() {
  loaded = false;
}

// play/pause can also come from outside the app (media keys, picture-in-picture,
// the OS pausing playback); follow the video
function onPlay() {
  setWantPlaying(true);
  startLoopWatch();
}

function onPause() {
  if (!video.ended && video.readyState > HAVE_NOTHING) {
    setWantPlaying(false);
  }
}

function onEnded() {
  // the section runs to the end of the video, start it over
  if (loop) {
    seek(loop.startTime);
    play();
  }
}

/**
 * @param {HTMLVideoElement} element
 * @param {() => void} [changed] called when the wanted play state changes
 * @returns {() => void} detach
 */
export function attachVideo(element, changed) {
  video = element;
  onChange = changed;
  video.addEventListener('loadedmetadata', onLoadedMetadata);
  video.addEventListener('emptied', onEmptied);
  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('ended', onEnded);
  if (video.readyState >= HAVE_METADATA) {
    onLoadedMetadata();
  }

  return () => {
    releaseSource();
    element.removeEventListener('loadedmetadata', onLoadedMetadata);
    element.removeEventListener('emptied', onEmptied);
    element.removeEventListener('play', onPlay);
    element.removeEventListener('pause', onPause);
    element.removeEventListener('ended', onEnded);
    if (loopFrame) {
      cancelAnimationFrame(loopFrame);
      loopFrame = null;
    }
    if (video === element) {
      video = null;
      onChange = null;
    }
  };
}
