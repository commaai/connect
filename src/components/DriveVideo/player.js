import { bindMediaElement, unbindMediaElement } from '../../timeline/media';
import { clampRouteOffsetToBounds, getEffectivePlayBounds, routeMsFromVideoSeconds,
  videoSecondsFromRouteMs } from '../../timeline/timing';
import { loadVideoSource } from './source';

// Commands run here, in the original user gesture. Media events report observations.
export default class RoutePlayer {
  constructor(video, options) {
    this.video = video;
    this.options = options;
    this.requestedPlaying = options.playRequested ?? true;
    this.rate = options.playSpeed ?? 1;
    this.pendingOffset = options.offset ?? options.zoom?.start ?? 0;
    this.lastOffset = this.pendingOffset;
    this.command = 0;
    this.disposed = false;
    this.loading = true;
    this.listeners = [];
    this.lastProgress = performance.now();
    this.lastTime = video.currentTime;
  }

  start(url) {
    const v = this.video;
    bindMediaElement(v, { routeFullname: this.options.currentRoute.fullname, controller: this });
    v.muted = this.options.isMuted;
    const ready = () => {
      this.applySeek(); this.detectReady();
      if (this.requestedPlaying && !this.playAttempted && !this.failed) this.play();
    };
    this.on(v, 'loadedmetadata', ready);
    this.on(v, 'canplay', ready);
    this.on(v, 'seeked', () => { this.finishSeek(); this.detectReady(); this.checkLoop(); });
    this.on(v, 'seeking', () => { this.lastProgress = performance.now(); });
    this.on(v, 'waiting', () => { this.loading = true; this.feedback({ loading: true }); });
    this.on(v, 'playing', () => {
      if (this.failed) return;
      this.looping = false;
      this.recovering = false;
      this.loading = false; this.feedback({ loading: false, error: null, tapToPlay: false }); this.tick();
    });
    this.on(v, 'play', () => { if (!v.paused) this.requestedPlaying = true; this.mirror(); this.tick(); });
    this.on(v, 'pause', () => {
      if (!this.failed && !this.looping && !this.recovering && !v.ended && !v.error && v.readyState > 0) this.requestedPlaying = false;
      this.stopTick(); this.mirror();
    });
    this.on(v, 'ended', () => this.checkLoop(true));
    this.on(v, 'timeupdate', () => { this.lastOffset = this.readOffset(); this.checkLoop(); });
    this.on(v, 'ratechange', () => { this.rate = v.playbackRate; this.mirror(); });
    this.on(v, 'volumechange', () => this.options.onMuteStatusChange?.(v.muted));
    this.on(window, 'online', () => { if (this.recoverable) this.options.onRetry(); });
    this.on(document, 'visibilitychange', () => { this.lastProgress = performance.now(); if (!document.hidden) { this.mirror(); this.tick(); } });
    this.cleanupSource = loadVideoSource(v, url, {
      onError: (message) => this.fail(message),
      onAudio: (hasAudio) => this.options.onAudioStatusChange?.(hasAudio),
      onRecover: () => {
        this.recovering = true; this.playAttempted = false;
        this.loading = true; this.lastProgress = performance.now();
        this.feedback({ loading: true });
      },
    });
    this.watchdog = setInterval(() => {
      if (this.failed) return;
      const now = performance.now();
      if (document.hidden || v.currentTime !== this.lastTime
        || (!this.loading && !v.seeking && v.paused && this.pendingOffset == null)) {
        this.lastProgress = now;
      }
      this.lastTime = v.currentTime;
      if (now - this.lastProgress > 15000) this.fail('Video loading timed out. Check your connection and try again.');
    }, 1000);
  }

  on(target, event, callback) {
    const listener = () => { if (!this.disposed) callback(); };
    target.addEventListener(event, listener);
    this.listeners.push(() => target.removeEventListener(event, listener));
  }
  feedback(state) { if (!this.disposed) this.options.onFeedback(state); }
  bounds() { return getEffectivePlayBounds(this.options, this.video.readyState ? this.video.duration : Infinity); }
  readOffset() {
    return this.pendingOffset ?? (this.video.readyState
      ? routeMsFromVideoSeconds(this.video.currentTime, this.options.currentRoute.videoStartOffset) : this.lastOffset);
  }
  snapshot() {
    return { offset: this.readOffset(), isPaused: this.video.paused, playSpeed: this.rate,
      playRequested: this.requestedPlaying };
  }
  mirror() {
    const snapshot = this.snapshot();
    if (JSON.stringify(snapshot) !== JSON.stringify(this.lastSnapshot)) {
      this.lastSnapshot = snapshot;
      this.options.onSnapshot(snapshot);
    }
  }
  update(options) {
    this.options = { ...this.options, ...options };
    const bounds = this.bounds();
    if (!bounds) { this.fail('No video is available in this selected range.', true); return; }
    if (this.unavailable) {
      this.failed = false; this.unavailable = false;
      this.feedback({ error: null, loading: true });
      this.seek(bounds.start);
      if (this.requestedPlaying) this.play();
    }
    if (bounds && (this.readOffset() < bounds.start || this.readOffset() > bounds.end)) this.seek(bounds.start);
    this.mirror();
  }
  seek(offset) {
    if (!Number.isFinite(offset) || this.disposed) return;
    this.pendingOffset = clampRouteOffsetToBounds(offset, this.bounds());
    this.lastProgress = performance.now();
    this.applySeek();
  }
  applySeek() {
    if (this.pendingOffset == null || !this.video.readyState) return;
    const bounds = this.bounds();
    if (!bounds) { this.fail('No video is available in this selected range.', true); return; }
    this.pendingOffset = clampRouteOffsetToBounds(this.pendingOffset, bounds);
    const time = videoSecondsFromRouteMs(this.pendingOffset, this.options.currentRoute.videoStartOffset);
    try {
      if (Math.abs(this.video.currentTime - time) > 0.001) this.video.currentTime = time;
      this.finishSeek();
    } catch (error) {
      if (error.name !== 'InvalidStateError') this.fail('Unable to seek this video. Try again.');
    }
  }
  finishSeek() {
    if (this.pendingOffset == null || this.video.seeking || !this.video.readyState) return;
    const time = videoSecondsFromRouteMs(this.pendingOffset, this.options.currentRoute.videoStartOffset);
    if (Math.abs(this.video.currentTime - time) < 0.05) {
      this.lastOffset = this.pendingOffset;
      this.pendingOffset = null;
      this.mirror();
    }
  }
  detectReady() {
    if (this.video.readyState >= 2 && !this.video.seeking) {
      this.loading = false;
      this.feedback({ loading: false });
      this.lastProgress = performance.now();
    }
  }
  play(rate = this.rate) {
    if (this.disposed) return;
    this.requestedPlaying = true;
    this.command += 1;
    const command = this.command;
    this.rate = rate;
    this.lastProgress = performance.now();
    if (!this.video.readyState) return;
    if (!this.bounds()) { this.fail('No video is available in this selected range.', true); return; }
    this.playAttempted = true;
    try {
      if (this.video.playbackRate !== rate) this.video.playbackRate = rate;
      this.rate = this.video.playbackRate;
      const promise = this.video.play();
      promise?.catch((error) => {
        if (this.disposed || command !== this.command) return;
        if (error.name === 'NotAllowedError') {
          this.requestedPlaying = false;
          this.feedback({ tapToPlay: true, loading: false });
          this.mirror();
        } else if (error.name !== 'AbortError' && error.name !== 'NotSupportedError') {
          this.fail('Unable to play this video. Try again.');
        }
      });
    } catch {
      this.rate = this.video.playbackRate;
      this.fail('This playback speed is not supported.');
      this.mirror();
    }
  }
  pause() {
    this.requestedPlaying = false;
    this.looping = false;
    this.command += 1;
    this.video.pause();
    this.stopTick();
    this.mirror();
  }
  setMuted(muted) {
    this.video.muted = muted;
    if (!muted && this.requestedPlaying) this.play();
  }
  checkLoop(ended = false) {
    if (!this.requestedPlaying) return;
    if (ended && this.looping) { if (this.video.paused) this.play(); return; }
    if (this.pendingOffset != null || this.video.seeking) return;
    const bounds = this.bounds();
    if (!bounds) return;
    if (ended || this.readOffset() >= bounds.end - 1) {
      this.looping = true;
      this.seek(bounds.start);
      if (this.video.paused) this.play();
    }
  }
  tick() {
    if (this.frame != null || this.video.paused || this.disposed || document.hidden) return;
    const callback = () => { this.frame = null; if (!this.disposed) { this.checkLoop(); this.tick(); } };
    this.frame = this.video.requestVideoFrameCallback
      ? this.video.requestVideoFrameCallback(callback) : requestAnimationFrame(callback);
  }
  stopTick() {
    if (this.frame == null) return;
    if (this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.frame);
    else cancelAnimationFrame(this.frame);
    this.frame = null;
  }
  fail(error, unavailable = false) {
    if (this.disposed) return;
    this.failed = true;
    this.unavailable = unavailable;
    this.recoverable = /connection|timed out/i.test(error);
    this.lastOffset = this.readOffset();
    this.stopTick();
    this.video.pause();
    this.feedback({ error, loading: false, tapToPlay: false });
    this.mirror();
  }
  dispose() {
    this.disposed = true;
    this.command += 1;
    this.stopTick();
    clearInterval(this.watchdog);
    this.listeners.forEach((remove) => remove());
    this.cleanupSource?.();
    unbindMediaElement(this.video, this);
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}
