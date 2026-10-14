import { nativeVideoErrorMessage } from './sourceMessages';

export function handleVideoElementError(video, refs) {
  if (!refs.alive || !video.error) return;
  const code = video.error.code;
  if (!refs.native) {
    if (code === 3) {
      if (refs.recover()) return;
    }
  } else if (code === 4) {
    refs.native = false;
    refs.onRecover?.();
    video.removeAttribute('src');
    video.load();
    refs.startHls();
    return;
  }
  refs.fail(nativeVideoErrorMessage(code));
}

export function beginNativePlayback(video, url) {
  video.src = url;
  video.load();
}
