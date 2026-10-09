import store from '../store';

const SEEK_TOLERANCE = 0.5; // hls.js may nudge its start position onto the buffer
const END_MARGIN = 0.5; // webkit never finishes a seek to the end

// ended: the video ended or a seek landed past it, until a seek lands back inside it
let current = null; // { el, route, ended }
// clock.offset is the route time when there is no loaded video or the video has ended
let clock = { offset: 0, since: Date.now(), speed: 0, hasRoute: false };

const videoStartOffset = () => store.getState().currentRoute?.videoStartOffset ?? 0;
let knownStartOffset = 0;
let subscribed = false;

const videoToRoute = (time) => (time * 1000) + videoStartOffset();
export const routeToVideo = (offset) => Math.max(0, offset - videoStartOffset()) / 1000;

// the previous route's element stays mounted until the next render
export function activeVideo() {
  return current && store.getState().currentRoute?.fullname === current.route ? current.el : null;
}

function loadedVideo() {
  const el = activeVideo();
  return el?.readyState >= HTMLMediaElement.HAVE_METADATA ? el : null;
}

function clockOffset() {
  const { loop, currentRoute } = store.getState();
  const el = activeVideo();
  // hold until the video loads so it starts where the clock stopped
  const running = clock.hasRoute && (!el || current.ended);
  const offset = clock.offset + (running ? (Date.now() - clock.since) * clock.speed : 0);
  const { startTime, duration } = loop ?? { startTime: 0, duration: currentRoute?.duration };
  if (!duration || offset <= startTime + duration) return Math.max(offset, startTime);
  return startTime + ((offset - startTime) % duration);
}

export function currentOffset() {
  const el = loadedVideo();
  if (current?.ended || !el) return clockOffset();
  return videoToRoute(el.currentTime);
}

export const pastVideoEnd = () => current?.ended ?? false;

function setClock(offset, speed) {
  clock = { offset, since: Date.now(), speed, hasRoute: store.getState().currentRoute != null };
}

export function setClockSpeed(speed) {
  setClock(currentOffset(), speed);
}

export function endVideo(speed) {
  const { loop, currentRoute } = store.getState();
  const end = loop ? loop.startTime + loop.duration : currentRoute?.duration;
  // a video longer than the loop must not wrap the clock into the next lap
  setClock(Math.min(currentOffset(), end ?? Infinity), speed);
  if (current) current.ended = true;
}

export function seekTo(offset) {
  const { loop } = store.getState();
  if (loop != null) offset = Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
  setClock(offset, clock.speed);
  const el = loadedVideo();
  if (!el) return;
  const time = routeToVideo(offset);
  current.ended = time >= el.duration;
  const target = current.ended ? el.duration - END_MARGIN : time;
  if (!current.ended || el.currentTime < target) el.currentTime = target;
}

function applyPendingSeek({ target }) {
  if (target !== activeVideo()) return;
  const offset = clockOffset();
  if (Math.abs(target.currentTime - routeToVideo(offset)) > SEEK_TOLERANCE) seekTo(offset);
}

// route events often arrive after the video was positioned: keep the shown time and move the video
function keepTimeOnStartOffsetChange() {
  const previous = knownStartOffset;
  knownStartOffset = videoStartOffset();
  const el = loadedVideo();
  if (el && !current.ended && knownStartOffset !== previous) seekTo((el.currentTime * 1000) + previous);
}

// the clock keeps the current frame while the element reloads
export function attachVideo(el, fullname) {
  setClockSpeed(clock.speed);
  current = { el, route: fullname, ended: false };
  knownStartOffset = videoStartOffset();
  if (!subscribed) {
    store.subscribe(keepTimeOnStartOffsetChange);
    subscribed = true;
  }
  el.addEventListener('loadedmetadata', applyPendingSeek, { once: true });
}

export function detachVideo(el) {
  if (el !== current?.el) return;
  setClockSpeed(clock.speed);
  el.removeEventListener('loadedmetadata', applyPendingSeek);
  current = null;
}
