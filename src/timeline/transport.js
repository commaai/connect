// Owns the <video> element and applies playback intents to it.
//
// The element is the source of truth: intents from redux (seek, pause, play)
// are applied to the element exactly once, and loading and error state is
// derived from media element events, never from polling.
import Hls from 'hls.js';

import { api } from '../api/backend';
import { bufferVideo, setVideoError, setVideoSeeking } from './playback';
import { registerVideoElement, unregisterVideoElement } from './videoClock';

const RETRY_DELAYS_MS = [1000, 2000, 4000];
const LOOP_SEEK_GUARD_MS = 250;
const MEDIA_ERR_NETWORK = typeof MediaError !== 'undefined' ? MediaError.MEDIA_ERR_NETWORK : 2;

function routeOffsetToVideoTime(offsetMs, videoStartOffset) {
  return Math.max(0, (offsetMs - (videoStartOffset || 0)) / 1000);
}

// Playback offset from redux state alone, without consulting the video
// element. Used when the element has no clock yet (a fresh source is
// loading): mirrors the wall-clock branch of currentOffset().
function stateOffsetMs(state) {
  if (state.offset === null && state.loop?.startTime != null) {
    return state.loop.startTime;
  }
  const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
  const offset = (state.offset ?? 0) + (Date.now() - state.startTime) * playSpeed;
  if (state.loop?.startTime != null) {
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      return loopOffset;
    }
    if (offset > loopOffset + state.loop.duration) {
      return ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}

export class TransportController {
  constructor(video, store, callbacks = {}) {
    this.video = video;
    this.store = store;
    this.onAudioStatusChange = callbacks.onAudioStatusChange || (() => {});

    this.lastAppliedNonce = -1;
    this.lastSpeed = null;
    this.lastPaused = null;
    this.currentRouteKey = null;
    this.currentSrc = null;
    this.hls = null;
    this.retryCount = 0;
    this.retryTimer = null;
    this.lastLoopSeek = 0;
    this.destroyed = false;
    this.unsubscribe = null;

    this.handleStoreChange = this.handleStoreChange.bind(this);
    this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
    this.handleWaiting = this.handleWaiting.bind(this);
    this.handlePlaying = this.handlePlaying.bind(this);
    this.handleCanPlay = this.handleCanPlay.bind(this);
    this.handleSeeking = this.handleSeeking.bind(this);
    this.handleSeeked = this.handleSeeked.bind(this);
    this.handleLoadedMetadata = this.handleLoadedMetadata.bind(this);
    this.handleLoadStart = this.handleLoadStart.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleHlsError = this.handleHlsError.bind(this);
    this.handleHlsBufferCodecs = this.handleHlsBufferCodecs.bind(this);

    video.addEventListener('timeupdate', this.handleTimeUpdate);
    video.addEventListener('waiting', this.handleWaiting);
    video.addEventListener('playing', this.handlePlaying);
    video.addEventListener('canplay', this.handleCanPlay);
    video.addEventListener('seeking', this.handleSeeking);
    video.addEventListener('seeked', this.handleSeeked);
    video.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    video.addEventListener('loadstart', this.handleLoadStart);
    video.addEventListener('error', this.handleError);

    registerVideoElement(video);
    // load first, then subscribe: the dispatches inside loadForRoute must not
    // re-enter handleStoreChange before the source is attached
    const route = store.getState().currentRoute;
    this.currentRouteKey = route ? route.fullname : null;
    this.loadForRoute(route);
    this.applyIntents(store.getState());
    this.unsubscribe = store.subscribe(this.handleStoreChange);
  }

  destroy() {
    this.destroyed = true;
    const { video } = this;
    video.removeEventListener('timeupdate', this.handleTimeUpdate);
    video.removeEventListener('waiting', this.handleWaiting);
    video.removeEventListener('playing', this.handlePlaying);
    video.removeEventListener('canplay', this.handleCanPlay);
    video.removeEventListener('seeking', this.handleSeeking);
    video.removeEventListener('seeked', this.handleSeeked);
    video.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    video.removeEventListener('loadstart', this.handleLoadStart);
    video.removeEventListener('error', this.handleError);
    this.destroyHls();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    unregisterVideoElement();
  }

  // wired to the error card's Retry button
  retry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = 0;
    this.currentSrc = null;
    this.store.dispatch(setVideoError(null));
    this.loadForRoute(this.store.getState().currentRoute);
    this.applyIntents(this.store.getState());
  }

  handleStoreChange() {
    if (this.destroyed) {
      return;
    }
    const state = this.store.getState();
    const route = state.currentRoute;
    const routeKey = route ? route.fullname : null;
    if (routeKey !== this.currentRouteKey) {
      this.currentRouteKey = routeKey;
      this.loadForRoute(route);
    }
    this.applyIntents(state);
  }

  applyIntents(state) {
    if (this.destroyed || !this.currentSrc) {
      return;
    }
    const { video } = this;

    // seek: each intent is applied exactly once, keyed by nonce,
    // so rapid seeks never replay a stale one and nothing fights the element
    const req = state.seekRequest;
    if (req && req.nonce !== this.lastAppliedNonce) {
      this.lastAppliedNonce = req.nonce;
      video.currentTime = routeOffsetToVideoTime(req.offset, state.currentRoute?.videoStartOffset);
    }

    const paused = state.desiredPlaySpeed === 0;
    if (paused !== this.lastPaused) {
      this.lastPaused = paused;
      if (paused) {
        video.pause();
      } else {
        const playPromise = video.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(() => {
            // autoplay policy or a racing pause: surface as buffering,
            // the next user gesture resumes playback
            if (!this.destroyed) {
              this.store.dispatch(bufferVideo(true));
            }
          });
        }
      }
    }

    // discrete speeds only: never micro-adjust the rate to chase a clock,
    // which is what made audio cut in and out
    if (!paused && state.desiredPlaySpeed !== this.lastSpeed) {
      this.lastSpeed = state.desiredPlaySpeed;
      video.playbackRate = state.desiredPlaySpeed;
    }
  }

  loadForRoute(route, isRetry = false) {
    this.destroyHls();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (!route) {
      this.currentSrc = null;
      this.video.removeAttribute('src');
      this.video.load();
      return;
    }

    let src;
    try {
      src = api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
    } catch (err) {
      this.fail('Unable to load video');
      return;
    }
    if (!src || src === this.currentSrc) {
      return;
    }
    this.currentSrc = src;
    if (!isRetry) {
      // a genuinely new stream; retry reloads of the same stream keep the count
      // so a persistently failing network still exhausts the backoff
      this.retryCount = 0;
    }
    // a new media resource starts paused at time 0 with no clock: re-assert
    // play state, speed, and position once it is attached below
    this.lastPaused = null;
    this.lastSpeed = null;
    this.store.dispatch(setVideoError(null));
    this.store.dispatch(bufferVideo(true));

    if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      // native HLS (iOS and desktop Safari): one code path, always the element
      this.video.src = src;
    } else {
      const hls = new Hls({ maxBufferLength: 40 });
      this.hls = hls;
      hls.on(Hls.Events.ERROR, this.handleHlsError);
      hls.on(Hls.Events.BUFFER_CODECS, this.handleHlsBufferCodecs);
      hls.loadSource(src);
      hls.attachMedia(this.video);
    }
  }

  destroyHls() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  handleTimeUpdate() {
    if (this.destroyed) {
      return;
    }
    // trap playback inside the selected loop; the guard keeps a slow
    // timeupdate cadence from re-seeking every tick
    const state = this.store.getState();
    const { loop, currentRoute } = state;
    if (!loop || loop.startTime == null || !loop.duration) {
      return;
    }
    const videoStartOffset = currentRoute?.videoStartOffset || 0;
    const offsetMs = this.video.currentTime * 1000 + videoStartOffset;
    if (offsetMs >= loop.startTime + loop.duration) {
      const now = Date.now();
      if (now - this.lastLoopSeek > LOOP_SEEK_GUARD_MS) {
        this.lastLoopSeek = now;
        this.video.currentTime = Math.max(0, (loop.startTime - videoStartOffset) / 1000);
      }
    }
  }

  handleLoadStart() {
    this.store.dispatch(bufferVideo(true));
  }

  handleWaiting() {
    this.store.dispatch(bufferVideo(true));
  }

  handleSeeking() {
    this.store.dispatch(bufferVideo(true));
    this.store.dispatch(setVideoSeeking(true));
  }

  handleSeeked() {
    this.store.dispatch(setVideoSeeking(false));
    if (this.video.readyState >= 3) {
      // the seek landed on a real frame with data behind it
      this.store.dispatch(bufferVideo(false));
    }
    // otherwise a waiting event re-asserts buffering until data arrives,
    // so the loading overlay never flickers off on an empty seek
  }

  handlePlaying() {
    this.retryCount = 0;
    this.store.dispatch(bufferVideo(false));
    this.store.dispatch(setVideoError(null));
  }

  handleCanPlay() {
    // enough data to start: clears the initial loading state even while paused
    this.store.dispatch(bufferVideo(false));
  }

  handleLoadedMetadata() {
    this.store.dispatch(setVideoError(null));
    // iOS plays HLS natively, so inspect the element directly for audio
    const tracks = this.video.audioTracks;
    if (tracks && tracks.length > 0) {
      this.onAudioStatusChange(true);
    }
    // The new media resource starts at time 0 with no clock. Position it at
    // the timeline offset now; this also absorbs any seek intent that landed
    // before metadata was available, since the reducer already folded it
    // into state.offset.
    const state = this.store.getState();
    const req = state.seekRequest;
    if (req) {
      this.lastAppliedNonce = req.nonce;
    }
    this.video.currentTime = routeOffsetToVideoTime(
      stateOffsetMs(state),
      state.currentRoute?.videoStartOffset,
    );
  }

  handleError() {
    const err = this.video.error;
    if (!err) {
      return;
    }
    if (err.code === MEDIA_ERR_NETWORK) {
      this.scheduleRetry();
    } else {
      this.fail('Unable to load video');
    }
  }

  handleHlsError(event, data) {
    if (!data || !data.fatal) {
      // transient stalls stay in buffering with no error UI
      return;
    }
    if (data.type === 'networkError' && data.response && data.response.code === 404) {
      this.fail('This video segment has not uploaded yet or has been deleted.');
      return;
    }
    if (data.type === 'networkError') {
      this.scheduleRetry();
      return;
    }
    this.fail('Unable to load video');
  }

  handleHlsBufferCodecs(event, data) {
    if (data && this.onAudioStatusChange) {
      this.onAudioStatusChange(Boolean(data.audio));
    }
  }

  scheduleRetry() {
    if (this.retryCount >= RETRY_DELAYS_MS.length) {
      this.fail('Unable to load video. Check your network connection.');
      return;
    }
    const delay = RETRY_DELAYS_MS[this.retryCount];
    this.retryCount += 1;
    this.store.dispatch(bufferVideo(true));
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.retryTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.currentSrc = null;
        this.loadForRoute(this.store.getState().currentRoute, true);
        this.applyIntents(this.store.getState());
      }
    }, delay);
  }

  fail(message) {
    this.destroyHls();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.store.dispatch(bufferVideo(false));
    this.store.dispatch(setVideoError(message));
  }
}
