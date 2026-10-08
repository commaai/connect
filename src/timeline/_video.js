let video = null;
const listeners = new Set();

export function setVideo(element) {
  video = element;
  for (const listener of listeners) {
    listener();
  }
}

export const getVideo = () => video;

export function subscribeVideo(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
