// One source lifetime. Native HLS can report "maybe" yet fail for this stream's codecs.
export function loadVideoSource(video, url, { onError, onAudio, onRecover }) {
  let alive = true;
  let hls = null;
  let native = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
  let recovered = false;
  const tracks = video.audioTracks;
  const audio = () => alive && native && onAudio(tracks ? tracks.length > 0 : null);
  const fail = (message) => alive && onError(message);
  const recover = () => {
    if (!hls || recovered) return false;
    recovered = true;
    onRecover?.();
    hls.recoverMediaError();
    return true;
  };
  const nativeError = () => {
    if (!alive || !video.error) return;
    if (!native && video.error.code === 3 && recover()) return;
    if (native && video.error.code === 4) {
      native = false;
      onRecover?.();
      video.removeAttribute('src');
      video.load();
      startHls();
    } else {
      fail(video.error.code === 2 ? 'Unable to load video. Check your connection.' : 'Unable to play this video.');
    }
  };
  async function startHls() {
    try {
      const { default: Hls } = await import('hls.js');
      if (!alive) return;
      if (!Hls.isSupported()) { fail('This browser cannot play this video.'); return; }
      hls = new Hls({ maxBufferLength: 40 });
      hls.on(Hls.Events.BUFFER_CODECS, (_, data) => alive && onAudio(Boolean(data.audio)));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!alive || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recover()) return;
        fail(data.response?.code === 404 ? 'This video has not uploaded yet or has been deleted.'
          : data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'Unable to load video. Check your connection.'
            : 'Unable to play this video.');
      });
      hls.attachMedia(video);
      hls.loadSource(url);
    } catch {
      fail('Unable to load the video player. Try again.');
    }
  }
  onAudio(null);
  video.addEventListener('error', nativeError);
  video.addEventListener('loadedmetadata', audio);
  video.addEventListener('canplay', audio);
  tracks?.addEventListener?.('addtrack', audio);
  tracks?.addEventListener?.('removetrack', audio);
  if (native) { video.src = url; video.load(); } else { startHls(); }
  return () => {
    alive = false;
    video.removeEventListener('error', nativeError);
    video.removeEventListener('loadedmetadata', audio);
    video.removeEventListener('canplay', audio);
    tracks?.removeEventListener?.('addtrack', audio);
    tracks?.removeEventListener?.('removetrack', audio);
    hls?.destroy();
  };
}
