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

export function setPlaybackRate(element, rate) {
  element.defaultPlaybackRate = rate;
  element.playbackRate = rate;
}

export function playIgnoringInterruptions(element) {
  element.play().catch((error) => {
    if (error.name === 'AbortError') return;
    console.error(error);
  });
}

export function subscribeVideo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
