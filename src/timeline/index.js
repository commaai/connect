import store from '../store';

const SEEK_TOLERANCE = 0.5; // hls.js may nudge its start position onto the buffer
const END_MARGIN = 0.5; // webkit never finishes a seek to the end

let video = null;
let videoRoute = null;
// wall clock used when no video drives the time (missing video, fatal error, past the video end)
let clock = { offset: 0, since: Date.now(), speed: 0, hasRoute: false };
// the route can outlast its video, the element shows its last frame while the clock plays on
let pastEnd = false;

const videoStartOffset = () => store.getState().currentRoute?.videoStartOffset ?? 0;

const videoToRoute = (time) => (time * 1000) + videoStartOffset();
export const routeToVideo = (offset) => Math.max(0, offset - videoStartOffset()) / 1000;

// the element of the previous route stays mounted until the next render
export function activeVideo() {
  return video && store.getState().currentRoute?.fullname === videoRoute ? video : null;
}

function clockOffset() {
  const { loop, currentRoute } = store.getState();
  const el = activeVideo();
  // hold the clock until the route and its video load so the video starts where the clock stopped
  const running = clock.hasRoute && (!el || pastEnd);
  const offset = clock.offset + (running ? (Date.now() - clock.since) * clock.speed : 0);
  const { startTime, duration } = loop ?? { startTime: 0, duration: currentRoute?.duration };
  if (!duration || offset <= startTime + duration) return Math.max(offset, startTime);
  return startTime + ((offset - startTime) % duration);
}

export function currentOffset() {
  const el = activeVideo();
  if (pastEnd || !(el?.readyState >= HTMLMediaElement.HAVE_METADATA)) return clockOffset();
  return videoToRoute(el.currentTime);
}

export const pastVideoEnd = () => pastEnd;

function setClock(offset, speed) {
  clock = { offset, since: Date.now(), speed, hasRoute: store.getState().currentRoute != null };
}

export function setClockSpeed(speed) {
  setClock(currentOffset(), speed);
}

// anchors the clock at the video end before it takes over
export function endVideo(speed) {
  setClockSpeed(speed);
  pastEnd = true;
}

export function seekTo(offset) {
  const { loop } = store.getState();
  if (loop != null) offset = Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
  setClock(offset, clock.speed);
  const el = activeVideo();
  if (!(el?.readyState >= HTMLMediaElement.HAVE_METADATA)) return;
  const time = routeToVideo(offset);
  pastEnd = time >= el.duration;
  const target = pastEnd ? el.duration - END_MARGIN : time;
  if (!pastEnd || el.currentTime < target) el.currentTime = target;
}

function applyPendingSeek({ target }) {
  if (target !== activeVideo()) return;
  const offset = clockOffset();
  if (Math.abs(target.currentTime - routeToVideo(offset)) > SEEK_TOLERANCE) seekTo(offset);
}

// also re-anchors the clock to the current frame before the element reloads its media
export function attachVideo(el, fullname) {
  setClockSpeed(clock.speed);
  video = el;
  videoRoute = fullname;
  pastEnd = false;
  el.addEventListener('loadedmetadata', applyPendingSeek, { once: true });
}

export function detachVideo(el) {
  if (el !== video) return;
  setClockSpeed(clock.speed);
  el.removeEventListener('loadedmetadata', applyPendingSeek);
  video = null;
  pastEnd = false;
}
