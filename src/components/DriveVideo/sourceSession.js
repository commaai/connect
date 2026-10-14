import { loadHlsSource } from './sourceHls';
import { bindSourceListeners } from './sourceListeners';
import { beginNativePlayback, handleVideoElementError } from './sourceNative';

function createPlaybackRefs(video, { onError, onAudio, onRecover }) {
  const refs = {
    alive: true,
    hls: null,
    native: Boolean(video.canPlayType('application/vnd.apple.mpegurl')),
    recovered: false,
    onRecover,
    fail: (message) => refs.alive && onError(message),
    recover() {
      if (!refs.hls || refs.recovered) return false;
      refs.recovered = true;
      onRecover?.();
      refs.hls.recoverMediaError();
      return true;
    },
    startHls: null,
  };
  return refs;
}

// One source lifetime. Native HLS can report "maybe" yet fail for this stream's codecs.
export function createVideoSourceSession(video, url, { onError, onAudio, onRecover }) {
  const refs = createPlaybackRefs(video, { onError, onAudio, onRecover });
  const tracks = video.audioTracks;
  const reportNativeAudio = () => refs.alive && refs.native
    && onAudio(tracks ? tracks.length > 0 : null);
  const onVideoError = () => handleVideoElementError(video, refs);

  refs.startHls = () => loadHlsSource(refs, video, url, onAudio);

  onAudio(null);
  const unbind = bindSourceListeners(video, tracks, { onError: onVideoError, onAudio: reportNativeAudio });
  if (refs.native) beginNativePlayback(video, url);
  else refs.startHls();
  return () => {
    refs.alive = false;
    unbind();
    refs.hls?.destroy();
  };
}
