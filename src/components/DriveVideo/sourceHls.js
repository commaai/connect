import { hlsFatalErrorMessage } from './sourceMessages';

export function createHlsInstance(Hls, { isAlive, onAudio, recover, fail }) {
  const hls = new Hls({ maxBufferLength: 40 });
  hls.on(Hls.Events.BUFFER_CODECS, (_, data) => isAlive() && onAudio(Boolean(data.audio)));
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (!isAlive() || !data.fatal) return;
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recover()) return;
    fail(hlsFatalErrorMessage(Hls, data));
  });
  return hls;
}

export async function loadHlsSource(refs, video, url, onAudio) {
  try {
    const { default: Hls } = await import('hls.js');
    if (!refs.alive) return;
    if (!Hls.isSupported()) { refs.fail('This browser cannot play this video.'); return; }
    refs.hls = createHlsInstance(Hls, {
      isAlive: () => refs.alive,
      onAudio,
      recover: () => refs.recover(),
      fail: refs.fail,
    });
    refs.hls.attachMedia(video);
    refs.hls.loadSource(url);
  } catch {
    refs.fail('Unable to load the video player. Try again.');
  }
}
