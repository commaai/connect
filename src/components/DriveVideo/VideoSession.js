import Hls from 'hls.js';
import * as Types from '../../actions/types';
import { mediaState } from '../../timeline/playback';

// One native video element owns playback, including browser/fullscreen controls.
export default class VideoSession {
  constructor(video, dispatch, onError) {
    this.video = video;
    this.dispatch = dispatch;
    this.onError = onError;
    this.listeners = {};
    const listen = (name, handler) => {
      this.listeners[name] = handler;
      video.addEventListener(name, handler);
    };
    listen('loadedmetadata', () => { this.seek(this.pending ?? this.state.offset); this.resume(); });
    listen('canplay', () => { this.report({ isBufferingVideo: false }); this.resume(); });
    listen('playing', () => {
      this.failed = false;
      this.onError(null);
      this.report({ desiredPlaySpeed: video.playbackRate, playbackRate: video.playbackRate, isBufferingVideo: false });
      this.tick();
    });
    listen('pause', () => {
      this.stopTick();
      if (!video.ended && !this.recovering && !this.failed) this.report({
        desiredPlaySpeed: 0, isBufferingVideo: false,
        ...(this.pending == null ? { offset: this.offset() } : {}),
      });
    });
    for (const event of ['waiting', 'stalled', 'seeking']) {
      listen(event, () => { this.stopTick(); this.report({ isBufferingVideo: true }); });
    }
    listen('seeked', () => {
      this.pending = null;
      this.seek(this.offset());
      this.report({ isBufferingVideo: video.readyState < 2 });
      if (!video.paused) this.tick();
    });
    listen('timeupdate', () => this.progress());
    listen('ended', () => this.progress());
    listen('ratechange', () => {
      this.report({ playbackRate: video.playbackRate, ...(!video.paused ? { desiredPlaySpeed: video.playbackRate } : {}) });
    });
    listen('error', () => {
      // hls.js owns recovery for its media source.
      if (!this.hls) {
        if (Hls.isSupported()) {
          this.recovering = true;
          this.pending = this.state.offset;
          video.removeAttribute('src');
          video.load();
          this.loadHls();
        } else this.fail(video.error?.code === 2 ? 'Unable to load video. Check your connection.' : 'This video is unavailable or could not be decoded.');
      }
    });
  }

  report(playback) {
    if (!this.destroyed) this.dispatch(mediaState(this.fullname, playback));
  }

  offset() {
    return this.video.currentTime * 1000 + (this.state.currentRoute.videoStartOffset ?? 0);
  }

  bounds() {
    const origin = this.state.currentRoute.videoStartOffset ?? 0;
    const start = Math.max(origin, this.state.loop?.startTime ?? this.state.zoom?.start ?? 0);
    const routeEnd = this.state.loop ? this.state.loop.startTime + this.state.loop.duration : this.state.currentRoute.duration;
    const end = Number.isFinite(this.video.duration) ? Math.min(routeEnd, origin + this.video.duration * 1000) : routeEnd;
    return { start, end, origin };
  }

  update(action, state) {
    if (this.fullname && state.currentRoute?.fullname !== this.fullname) return;
    const previous = this.state;
    this.state = state;
    this.fullname = state.currentRoute.fullname;
    if (action.type === Types.ACTION_SEEK || action.type === Types.ACTION_RESET
      || previous?.loop !== state.loop
      || previous?.currentRoute.videoStartOffset !== state.currentRoute.videoStartOffset) {
      this.seek(state.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0);
    }
    if (action.type === Types.ACTION_PLAY || action.type === Types.ACTION_RESET) {
      if (this.offset() >= this.bounds().end) this.seek(this.bounds().start);
      this.resume();
    } else if (action.type === Types.ACTION_SEEK) {
      this.resume();
    } else if (action.type === Types.ACTION_PAUSE) {
      this.playAttempt = (this.playAttempt ?? 0) + 1;
      this.video.pause();
    }
  }

  seek(offset) {
    this.pending = offset;
    const { start, end, origin } = this.bounds();
    if (end <= start) { this.fail('There is no video in this selection.'); return; }
    const target = (Math.max(start, Math.min(end, offset)) - origin) / 1000;
    if (this.failed) {
      this.failed = false;
      this.onError(null);
      this.hls?.startLoad(target);
    }
    if (this.video.readyState < 1) return;
    if (Math.abs(this.video.currentTime - target) > 0.001) {
      this.video.currentTime = target;
    } else {
      this.pending = null;
      this.report({ offset: this.offset() });
    }
  }

  resume() {
    this.recovering = false;
    if (this.failed || !this.state.desiredPlaySpeed) return;
    this.video.playbackRate = this.state.desiredPlaySpeed;
    if (!this.video.paused) return;
    const attempt = this.playAttempt = (this.playAttempt ?? 0) + 1;
    this.video.play()?.catch((error) => {
      if (this.destroyed || attempt !== this.playAttempt || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') this.report({ desiredPlaySpeed: 0, isBufferingVideo: false });
      else this.fail('Unable to play this video. Try again.');
    });
  }

  progress(force = true) {
    if (this.pending != null || this.video.seeking || this.failed) return;
    const { start, end } = this.bounds();
    const offset = this.offset();
    if (this.state.desiredPlaySpeed && (this.video.ended || offset >= end)) {
      this.seek(start);
      this.resume();
    } else if (offset !== this.state.offset && (force || performance.now() - (this.lastReport ?? 0) >= 100)) {
      this.lastReport = performance.now();
      this.report({ offset });
    }
  }

  tick = () => {
    this.stopTick();
    this.progress(false);
    if (!this.video.paused && !this.destroyed) this.frame = requestAnimationFrame(this.tick);
  };

  stopTick() { cancelAnimationFrame(this.frame); }

  fail(message) {
    if (this.destroyed) return;
    this.playAttempt = (this.playAttempt ?? 0) + 1;
    this.failed = true;
    this.stopTick();
    this.video.pause();
    this.report({ isBufferingVideo: false });
    this.onError(message);
  }

  load(url) {
    this.url = url;
    this.failed = false;
    this.onError(null);
    this.report({ isBufferingVideo: true });
    if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = url;
    } else if (Hls.isSupported()) {
      this.loadHls();
    } else {
      this.fail('This browser does not support video playback.');
    }
  }

  loadHls() {
    this.playAttempt = (this.playAttempt ?? 0) + 1;
    this.failed = false;
    this.onError(null);
    this.hls = new Hls({ maxBufferLength: 40, backBufferLength: 60 });
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (this.destroyed) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.fatal && !this.recovered) {
        this.playAttempt = (this.playAttempt ?? 0) + 1;
        this.recovered = this.recovering = true;
        this.pending = this.state.offset;
        this.hls.recoverMediaError();
      } else if (data.fatal) {
        const status = data.response?.code;
        this.fail(status === 404
          ? 'This video segment has not uploaded yet or has been deleted.'
          : status === 401 || status === 403
            ? 'This video is unavailable or you no longer have access.'
            : 'Unable to load video. Check your connection and try again.');
      }
    });
    this.hls.loadSource(this.url);
    this.hls.attachMedia(this.video);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopTick();
    for (const [name, listener] of Object.entries(this.listeners)) this.video.removeEventListener(name, listener);
    this.hls?.destroy();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
