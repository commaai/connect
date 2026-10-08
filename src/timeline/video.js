let video = null;
const listeners = new Set();

export function setVideo(element) {
  video = element;
  for (const listener of listeners) {
    listener();
  }
}

export const getVideo = () => video;

export function getPlaybackSpeed(element) {
  if (element.paused) return 0;
  return element.playbackRate;
}

export function playIgnoringInterruptions(element) {
  element.play().catch(() => {});
}

export function subscribeVideo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
