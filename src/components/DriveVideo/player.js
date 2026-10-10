import { isFirefox } from '../../utils/browser';
import { videoMapping } from '../../timeline/videoTime';

export function createPlayer(video, { src, route, onTime, onPlaying, onStatus, onAudio, onPause = () => {},
  fetchPlaylist = fetch, loadHls = () => import('hls.js') }) {
  let alive = true;
  let hls;
  let mapping;
  let playlist;
  let timingRoute = route;
  let waiting = false;
  let intent = {};
  let pending = null;
  let issued = false;
  let seekTarget = 0;
  let initialized = false;
  let revision = -1;
  let playRequest = 0;
  let starting = false;
  let blocked = false;
  let frame;
  let timeout;
  let failed = false;
  const request = new AbortController();
  const listeners = [];
  const report = (status) => { if (alive) onStatus(status); };
  function clearWaiting() {
    waiting = false;
    clearTimeout(timeout);
    timeout = null;
    report({ buffering: false });
  }
  function fail(message) {
    if (!alive) return;
    failed = true;
    clearTimeout(timeout);
    request.abort();
    hls?.stopLoad();
    video.pause();
    report({ error: message, buffering: false, blocked: false });
  }
  function resume() {
    if (!alive || failed || blocked || !intent.desiredPlaySpeed || !video.paused || starting
      || !initialized || pending !== null) return;
    starting = true;
    playRequest += 1;
    const attempt = playRequest;
    const rejected = (error) => {
      if (!alive || attempt !== playRequest) return;
      starting = false;
      if (error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') { blocked = true; clearWaiting(); report({ blocked: true, buffering: false }); }
      else fail('Unable to play this video. Retry to try again.');
    };
    try {
      Promise.resolve(video.play()).then(() => {
        if (alive && attempt === playRequest) starting = false;
      }, rejected);
    } catch (error) { rejected(error); }
  }
  function position() {
    if (pending === null || !mapping || video.readyState < 1) return;
    // Metadata can precede the first MSE append; early seeks can hang on WebKit.
    if (!initialized && (video.readyState < 2 || !video.buffered.length)) return;
    const start = intent.loop?.startTime ?? 0;
    const end = intent.loop ? start + intent.loop.duration : Infinity;
    const target = Math.min(Number.isFinite(video.duration) ? video.duration : Infinity,
      Math.max(!initialized ? video.buffered.start(0) : 0, mapping.toMedia(Math.max(start, Math.min(end, pending)))));
    if (!Number.isFinite(target)) return;
    try {
      if (!issued && video.currentTime !== target) video.currentTime = target;
      issued = true;
      seekTarget = target;
      initialized = true;
    } catch { return; }
    if (!video.seeking && Math.abs(video.currentTime - target) < 0.001) pending = null;
  }
  function sample() {
    if (!alive || failed) return;
    position();
    if (pending !== null || video.seeking || !mapping || video.readyState < 1) return;
    const offset = mapping.toRoute(video.currentTime);
    const loop = intent.loop;
    if (intent.desiredPlaySpeed && loop?.duration > 0
      && (offset >= loop.startTime + loop.duration || video.ended)) {
      const first = mapping.toMedia(loop.startTime);
      const last = mapping.toMedia(loop.startTime + loop.duration);
      if (last <= first) { fail('No video is available in this range.'); return; }
      pending = loop.startTime;
      issued = false;
      position();
    } else onTime(offset, revision);
    resume();
  }
  function listen(event, callback) {
    const handler = () => { if (alive && !failed) callback(); };
    video.addEventListener(event, handler);
    listeners.push([event, handler]);
  }
  const progress = () => {
    position();
    resume();
    if (video.audioTracks) onAudio(video.audioTracks.length > 0);
  };
  const ready = (playing = false) => {
    progress();
    if (mapping && (playing || video.readyState >= 3)) clearWaiting();
  };
  ['loadedmetadata', 'loadeddata', 'progress'].forEach(event => listen(event, progress));
  listen('canplay', ready);
  listen('seeked', () => {
    if (issued && !video.seeking) {
      if (Math.abs(video.currentTime - seekTarget) < 0.001) pending = null;
      else issued = false;
    }
    sample();
    resume();
  });
  listen('timeupdate', sample);
  listen('waiting', () => {
    if (!intent.desiredPlaySpeed || blocked) return;
    waiting = true;
    report({ buffering: true });
    if (!timeout) timeout = setTimeout(() => fail('Video stalled. Retry to try again.'), 15000);
  });
  listen('playing', () => { ready(true); onPlaying(true); report({ blocked: false }); });
  listen('pause', () => {
    starting = false; onPlaying(false);
    if (!video.ended && intent.desiredPlaySpeed) { intent.desiredPlaySpeed = 0; onPause(); }
  });
  listen('ended', () => {
    sample();
    if (!intent.loop) { intent.desiredPlaySpeed = 0; onPause(); }
  });
  listen('error', () => fail(video.error?.code === 3 ? 'Unable to decode this video.' : 'Unable to load video. Check your connection.'));
  const tick = () => {
    if (!alive) return;
    sample();
    frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  timeout = setTimeout(() => fail('Video is taking too long to load. Retry to try again.'), 15000);
  report({ buffering: true, blocked: false, error: null });
  fetchPlaylist(src, { signal: request.signal }).then(async response => {
    if (!response.ok) throw new Error('Unable to load video timing');
    const text = await response.text();
    if (!alive) return;
    playlist = text;
    mapping = videoMapping(timingRoute, playlist);
    ready();
  }).catch(error => { if (alive && !request.signal.aborted) fail(error.message); });
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.load();
  } else {
    loadHls().then(({ default: Hls }) => {
      if (!alive || failed) return;
      if (!Hls.isSupported()) { fail('Video playback is not supported in this browser.'); return; }
      hls = new Hls({ maxBufferLength: 40 });
      let networkRecovery = false;
      let decodeRecovery = false;
      hls.on(Hls.Events.ERROR, (_event, error) => {
        if (!alive || failed || !error.fatal) return;
        if (error.response?.code === 404) fail('This video segment has not uploaded yet or has been deleted.');
        else if (error.type === 'networkError' && !networkRecovery) { networkRecovery = true; hls.startLoad(); }
        else if (error.type === 'mediaError' && !decodeRecovery) { decodeRecovery = true; hls.recoverMediaError(); }
        else fail('Unable to load video. Retry to try again.');
      });
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => { if (alive) onAudio(Boolean(data.audio)); });
      hls.on(Hls.Events.FRAG_BUFFERED, () => { if (alive && !failed) progress(); });
      hls.loadSource(src);
      hls.attachMedia(video);
    }).catch(() => fail('Unable to load the video player.'));
  }
  return {
    update(next) {
      if (!alive || failed) return;
      if (next.activate) blocked = false;
      const timingChanged = next.currentRoute && ['videoStartOffset', 'segment_numbers', 'segment_start_times', 'segment_end_times']
        .some(field => next.currentRoute[field] !== timingRoute[field]);
      if (timingChanged) {
        timingRoute = next.currentRoute;
        if (playlist) {
          try { mapping = videoMapping(timingRoute, playlist); }
          catch (error) { fail(error.message); return; }
        }
        // Keep the requested route time, but convert it again using the new mapping.
        if (pending !== null) issued = false;
      }
      const oldLoop = intent.loop;
      intent = { ...intent, ...next };
      const nextRevision = intent.seekRevision || 0;
      if (nextRevision !== revision || oldLoop !== intent.loop) {
        revision = nextRevision;
        pending = next.seekOffset ?? next.offset ?? intent.loop?.startTime ?? 0;
        if (oldLoop !== undefined && oldLoop !== intent.loop && intent.loop) pending = intent.loop.startTime;
        issued = false;
      }
      if (intent.muted !== undefined) video.muted = intent.muted;
      if (intent.desiredPlaySpeed > 0) video.playbackRate = Math.min(isFirefox() && !video.muted ? 8 : 16, intent.desiredPlaySpeed);
      position();
      if (intent.desiredPlaySpeed) resume();
      else {
        playRequest += 1; starting = false; video.pause();
        if (waiting) clearWaiting();
      }
      if (timingChanged) sample();
    },
    destroy() {
      if (!alive) return;
      alive = false;
      playRequest += 1;
      clearTimeout(timeout);
      request.abort();
      listeners.forEach(([event, handler]) => video.removeEventListener(event, handler));
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      video.pause();
      hls?.destroy();
      if (!hls || video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
    },
  };
}
