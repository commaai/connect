import { createVideoSourceSession } from './sourceSession';

export function loadVideoSource(video, url, callbacks) {
  return createVideoSourceSession(video, url, callbacks);
}
