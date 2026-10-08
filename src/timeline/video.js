// The <video> element is the clock. Everyone else reads it.
let video = null;
let pendingOffset = null;

export function bindVideo(element) {
  video = element || null;
  if (!video) pendingOffset = null;
}

export function videoOffset(route) {
  if (pendingOffset != null) {
    const seconds = videoSeconds(pendingOffset, route);
    if (!video || video.readyState < 1 || Math.abs(video.currentTime - seconds) > 0.25) {
      return pendingOffset;
    }
    pendingOffset = null;
  }

  if (!video || video.readyState < 1 || !Number.isFinite(video.currentTime)) return null;
  return (route?.videoStartOffset || 0) + video.currentTime * 1000;
}

export function seekVideo(offset, route) {
  pendingOffset = offset;
  if (!video || video.readyState < 1 || !Number.isFinite(offset)) return;
  const seconds = videoSeconds(offset, route);
  if (Math.abs(video.currentTime - seconds) < 0.05) {
    pendingOffset = null;
    return;
  }
  video.currentTime = seconds;
}

export function seekPending() {
  return pendingOffset != null;
}

function videoSeconds(offset, route) {
  const start = route?.videoStartOffset || 0;
  return Math.max(0, (offset - start) / 1000);
}
