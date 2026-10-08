import { parseQcameraPlaylist } from '../../timeline/videoTime';

const MISSING_VIDEO = 'This video segment has not uploaded yet or has been deleted.';

export function attachSource(video, { src, onStatus = () => {}, onManifest, onAudio, onTimeline, onReady, fetchPlaylist = fetch, loadHls = () => import('hls.js') }) {
  let alive = true;
  let generation = 0;
  let hls;
  let networkRetries = 0;
  let mediaRetries = 0;
  let timeout;
  let playlistRequest;
  let initialLoad = true;
  let status = { loading: Boolean(src), error: null, blocked: false };
  const report = patch => {
    if (!alive) return;
    status = { ...status, ...patch };
    if (!status.loading || status.error || status.blocked) { clearTimeout(timeout); timeout = null; }
    if (!timeout && initialLoad && status.loading && !status.error && !status.blocked) {
      timeout = setTimeout(() => {
        playlistRequest?.abort();
        hls?.stopLoad();
        report({ loading: false, blocked: false, error: 'Video is taking too long to load. Retry to try again.' });
      }, 15000);
    }
    onStatus(status);
  };
  function fail(error) {
    playlistRequest?.abort();
    hls?.stopLoad();
    report({ loading: false, blocked: false, error });
  }
  const waiting = () => { if (!status.error && !status.blocked) report({ loading: true }); };
  const ready = event => {
    if (status.error || (status.blocked && event.type !== 'playing')) return;
    if (video.buffered?.length) onReady?.();
    if (event.type === 'playing') { initialLoad = false; clearTimeout(timeout); timeout = null; }
    if (video.audioTracks) onAudio?.(video.audioTracks.length > 0);
    report({ loading: false, error: null, blocked: false });
  };

  function reportError(error) {
    if (!alive || error?.name === 'AbortError') return;
    if (error?.name === 'NotAllowedError') {
      report({ loading: false, error: null, blocked: true });
      return;
    }
    if (status.error) return;
    // Native media errors have no fatal flag. hls.js informational events do.
    if (error?.fatal === false) return;
    if (error?.code === 2 && !hls && networkRetries < 1) {
      networkRetries += 1;
      report({ loading: true, error: null, blocked: false });
      video.load();
      return;
    }
    if (error?.code === 4 && !hls) { fail('This video format or source is not supported by the browser.'); return; }
    if (error?.code === 3 && !hls && mediaRetries < 1) {
      mediaRetries += 1;
      report({ loading: true, error: null, blocked: false });
      video.load();
      return;
    }
    const code = error?.response?.code || error?.response?.status;
    if (code === 404) { fail(MISSING_VIDEO); return; }
    if (hls && error?.type === 'networkError' && networkRetries < 1) {
      networkRetries += 1;
      report({ loading: true, error: null, blocked: false });
      hls.startLoad();
    } else if (hls && error?.type === 'mediaError' && mediaRetries < 1) {
      mediaRetries += 1;
      report({ loading: true, error: null, blocked: false });
      hls.recoverMediaError();
    } else {
      fail('Unable to load video. Check your connection or retry.');
    }
  }

  async function start() {
    if (!alive) return;
    clearTimeout(timeout);
    timeout = null;
    playlistRequest?.abort();
    generation += 1;
    const visit = generation;
    hls?.destroy();
    hls = null;
    networkRetries = 0;
    mediaRetries = 0;
    initialLoad = true;
    report({ loading: Boolean(src), error: null, blocked: false });
    if (!src) { fail('No video is available for this drive.'); return; }
    if (onTimeline) {
      const request = new AbortController();
      playlistRequest = request;
      fetchPlaylist(src, { signal: request.signal }).then(async response => {
        if (!response.ok) throw new Error(String(response.status));
        const entries = parseQcameraPlaylist(await response.text());
        if (alive && visit === generation && !request.signal.aborted) {
          onTimeline(entries);
        }
      }).catch(() => {
        if (alive && visit === generation && !request.signal.aborted) {
          onTimeline(null);
        }
      });
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.load();
      return;
    }
    try {
      const { default: Hls } = await loadHls();
      if (!alive || visit !== generation) return;
      if (!Hls.isSupported()) { fail('Video playback is not supported in this browser.'); return; }
      const player = new Hls({ maxBufferLength: 40 });
      hls = player;
      player.on(Hls.Events.ERROR, (_event, error) => {
        if (alive && visit === generation) reportError(error);
      });
      player.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        if (alive && visit === generation) onManifest?.(data.details.fragments.map(({ url, duration, start: time, sn }) => ({ url, duration, start: time, sn })));
      });
      player.on(Hls.Events.FRAG_BUFFERED, () => {
        if (alive && visit === generation && !status.error && video.buffered?.length) onReady?.();
      });
      player.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
        if (alive && visit === generation) onAudio?.(Boolean(data.audio));
      });
      player.loadSource(src);
      player.attachMedia(video);
    } catch {
      if (alive && visit === generation) fail('Unable to load the video player. Retry to try again.');
    }
  }

  video.addEventListener('waiting', waiting);
  video.addEventListener('canplay', ready);
  video.addEventListener('playing', ready);
  start();
  return {
    reportError,
    retry: start,
    destroy() {
      clearTimeout(timeout);
      playlistRequest?.abort();
      alive = false;
      generation += 1;
      video.removeEventListener('waiting', waiting);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('playing', ready);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}
