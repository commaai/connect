let video = null;
const listeners = new Set();

export function setDriveVideo(element) {
  video = element;
  for (const listener of listeners) {
    listener();
  }
}

export const getDriveVideo = () => video;

export function getEffectivePlaybackRate(element) {
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

export function subscribeDriveVideo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
