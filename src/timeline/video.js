const CLOSE_ENOUGH_SECONDS = 0.25;
const HAVE_METADATA = 1;

let video = null;
let pendingOffset = null;

export function bindVideo(element) {
  video = element || null;
  if (!video) pendingOffset = null;
}

export function videoOffset(route) {
  if (pendingOffset != null) {
    if (!near(pendingOffset, route)) return pendingOffset;
    pendingOffset = null;
  }

  if (!hasTime(video)) return null;
  return (route?.videoStartOffset || 0) + video.currentTime * 1000;
}

export function seekVideo(offset, route) {
  pendingOffset = offset;
  if (!hasTime(video) || !Number.isFinite(offset)) return;
  if (near(offset, route)) {
    pendingOffset = null;
    return;
  }
  video.currentTime = videoSeconds(offset, route);
}

export function seekPending() {
  return pendingOffset != null;
}

function near(offset, route) {
  return hasTime(video)
    && Math.abs(video.currentTime - videoSeconds(offset, route)) <= CLOSE_ENOUGH_SECONDS;
}

function hasTime(element) {
  return Boolean(element) && element.readyState >= HAVE_METADATA && Number.isFinite(element.currentTime);
}

function videoSeconds(offset, route) {
  const start = route?.videoStartOffset || 0;
  return Math.max(0, (offset - start) / 1000);
}
