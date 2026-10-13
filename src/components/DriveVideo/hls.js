import hlsWorker from 'hls.js/dist/hls.worker.js?url';

// browsers can stall up to half a second before the end of the buffer
const STALL_DISTANCE = 0.5;

function playheadNeedsData({ buffered, currentTime }) {
  for (let i = 0; i < buffered.length; i++) {
    if (currentTime >= buffered.start(i) && currentTime < buffered.end(i)) {
      return buffered.end(i) - currentTime < STALL_DISTANCE;
    }
  }
  return true;
}

export function attachNativeSource(video, src, { onAudio, onError }) {
  const onAudioTrack = () => onAudio(true);
  const onMediaError = () => onError(
    !navigator.onLine || video.error?.code === MediaError.MEDIA_ERR_NETWORK ? 'network' : 'media',
  );
  video.audioTracks?.addEventListener('addtrack', onAudioTrack);
  video.addEventListener('error', onMediaError);
  video.src = src;
  // without autoplay, iOS only loads metadata until load() or play() is called
  video.load();

  return () => {
    video.audioTracks?.removeEventListener('addtrack', onAudioTrack);
    video.removeEventListener('error', onMediaError);
    video.removeAttribute('src');
    video.load();
  };
}

export function attachHlsSource(video, src, { startTime, onAudio, onError }) {
  let cancelled = false;
  let hls = null;
  // hls.js reaches an unavailable fragment long before playback does, so the one it stopped at
  // only counts once it blocks the playhead or nothing could load at all
  let missing = null;
  // reporting tears this source down, so it happens outside hls.js's own event dispatch
  const report = (kind) => queueMicrotask(() => {
    if (!cancelled) onError(kind);
  });

  const blocked = () => {
    const { start, end } = missing.frag;
    return !video.readyState || (video.currentTime >= start - STALL_DISTANCE && video.currentTime < end);
  };
  // a playhead that needs data anywhere else loads it again
  const followPlayhead = () => {
    if (!missing) return;
    if (blocked()) {
      report(missing.kind);
    } else if (playheadNeedsData(video)) {
      missing = null;
      hls.startLoad(video.currentTime, true);
    }
  };
  video.addEventListener('seeking', followPlayhead);
  video.addEventListener('waiting', followPlayhead);

  import('hls.js/light').then(({ default: Hls }) => {
    if (cancelled) return;
    if (!Hls.isSupported()) {
      report('media');
      return;
    }
    hls = new Hls({ maxBufferLength: 40, startPosition: startTime, workerPath: hlsWorker });
    hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudio(Boolean(data.audio)));
    hls.on(Hls.Events.ERROR, (_event, { fatal, frag, response, type }) => {
      const networkError = type === Hls.ErrorTypes.NETWORK_ERROR;
      const kind = { 403: 'expired', 404: 'not-found' }[response?.code]
        || (networkError || !navigator.onLine ? 'network' : 'media');
      // hls.js would retry a 4xx in vain, and stops by itself once other fragment failures are fatal
      if (frag && networkError && (fatal || kind !== 'network')) {
        hls.stopLoad();
        missing = { frag, kind };
        if (blocked()) report(kind);
      } else if (fatal) {
        report(kind);
      }
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  }).catch(() => report('network'));

  return () => {
    cancelled = true;
    video.removeEventListener('seeking', followPlayhead);
    video.removeEventListener('waiting', followPlayhead);
    hls?.destroy();
  };
}
