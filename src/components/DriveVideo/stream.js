import { isIos } from '../../utils/browser';

export const NOT_UPLOADED = 'This video has not uploaded yet or has been deleted.';
export const UNABLE = 'Unable to load video';

// iPhones and iPads play HLS themselves, as Apple recommends; iPadOS reports a desktop UA
const playsHlsNatively = () => isIos() || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// Opens the HLS stream at url in video, starting startTime seconds in. Calls onAttached
// once the video has its source, onAudio with whether the stream has sound, and onError
// with a message once it can't play. Returns a function that closes it.
export function openStream(video, url, { startTime, onAttached, onAudio, onError }) {
  let hls = null;
  let closed = false;

  const onNativeError = () => onError(UNABLE);
  const playNatively = () => {
    video.addEventListener('error', onNativeError);
    video.src = url;
    onAttached();
  };

  if (playsHlsNatively()) {
    playNatively();
  } else {
    import('hls.js/light').then(({ default: Hls }) => {
      if (closed) {
        return;
      }
      if (!Hls.isSupported()) {
        playNatively();
        return;
      }
      hls = new Hls({ startPosition: startTime, maxBufferLength: 40 });
      let recoveries = 0;
      hls.on(Hls.Events.BUFFER_CODECS, (_, data) => onAudio(Boolean(data.audio)));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries < 2) {
          recoveries += 1;
          hls.recoverMediaError();
          return;
        }
        onError(data.response?.code === 404 ? NOT_UPLOADED : UNABLE);
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      onAttached();
    }).catch(() => onError(UNABLE));
  }

  return () => {
    closed = true;
    hls?.destroy();
    video.removeEventListener('error', onNativeError);
    video.removeAttribute('src');
    video.load();
  };
}
