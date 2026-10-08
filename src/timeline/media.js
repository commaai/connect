import * as Types from '../actions/types';

// The owner creates a new controller for each source and disposes the old one.
export function createController(video, callbacks = {}) {
  let active = true;
  let intent = { speed: 0, muted: true, range: null, videoStartOffset: 0 };
  let revision;
  let pending = null;
  let issued = false;
  let playRequest = 0;
  let starting = false;
  let frame = null;
  let lastFrameSample = -Infinity;
  const listeners = [];
  const emit = (name, ...args) => {
    if (!active) return;
    if (name === 'onBuffering') callbacks.onStatus?.({ buffering: args[0] });
    else if (name === 'onBlocked') callbacks.onStatus?.({ blocked: true, error: args[0] });
    else if (name === 'onError') callbacks.onStatus?.({ error: args[0] });
    else callbacks[name]?.(...args);
  };
  const toMedia = (offset) => intent.toMedia ? intent.toMedia(offset) : (offset - intent.videoStartOffset) / 1000;
  const toRoute = (seconds) => intent.toRoute ? intent.toRoute(seconds) : seconds * 1000 + intent.videoStartOffset;
  const bounds = () => {
    const mappedStart = toMedia(intent.range?.start ?? intent.videoStartOffset);
    const start = Number.isFinite(mappedStart) ? Math.min(video.duration, Math.max(0, mappedStart)) : NaN;
    const end = Math.min(Number.isFinite(video.duration) ? video.duration : Infinity,
      intent.range ? toMedia(intent.range.end) : Infinity);
    return { start, end };
  };

  function resume() {
    if (!active || !intent.speed || !video.paused || starting) return;
    starting = true;
    playRequest += 1;
    const request = playRequest;
    const failed = (error) => {
      if (!active || request !== playRequest) return;
      starting = false;
      if (error?.name === 'AbortError') return;
      intent.speed = 0;
      emit('onPause');
      emit(error?.name === 'NotAllowedError' ? 'onBlocked' : 'onError', error);
    };
    try {
      const promise = video.play();
      Promise.resolve(promise).then(() => {
        if (active && request === playRequest) starting = false;
      }, failed);
    } catch (error) { failed(error); }
  }

  function seekPending() {
    if (pending === null || video.readyState < 1) return;
    const { start: first, end: last } = bounds();
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return;
    const mapped = toMedia(pending);
    if (!Number.isFinite(mapped)) return;
    const target = Math.min(last, Math.max(first, mapped));
    if (!Number.isFinite(target)) return;
    try {
      // No dead band: a 1ms command is just as explicit as a one-minute seek.
      if (!issued && video.currentTime !== target) video.currentTime = target;
      issued = true;
    } catch { return; } // Metadata may exist before the source can accept a seek.
    if (!video.seeking && Math.abs(video.currentTime - target) < 0.001) {
      pending = null;
      emit('onProgress', toRoute(video.currentTime), revision);
    }
  }

  function sample() {
    if (!active || video.readyState < 1) return;
    seekPending();
    if (pending !== null || video.seeking || !Number.isFinite(video.currentTime)) return;
    const { start: first, end: last } = bounds();
    if (intent.speed && last > first && video.currentTime >= last) {
      const next = first + ((video.currentTime - first) % (last - first));
      pending = toRoute(next);
      issued = false;
      seekPending();
      resume();
      return;
    }
    emit('onProgress', toRoute(video.currentTime), revision);
  }

  function listen(event, handler) {
    const guarded = () => { if (active) handler(); };
    video.addEventListener(event, guarded);
    listeners.push([event, guarded]);
  }
  listen('loadedmetadata', () => { seekPending(); resume(); });
  listen('durationchange', seekPending);
  listen('timeupdate', sample);
  listen('seeked', () => {
    // Native completion is authoritative even if the browser snapped the target.
    if (issued && !video.seeking) pending = null;
    seekPending();
    sample();
    emit('onBuffering', pending !== null);
  });
  listen('waiting', () => emit('onBuffering', true));
  listen('seeking', () => emit('onBuffering', true));
  listen('canplay', () => { seekPending(); emit('onBuffering', pending !== null); });
  listen('playing', () => emit('onBuffering', pending !== null));
  listen('emptied', () => { playRequest += 1; starting = false; });
  listen('pause', () => {
    if (!video.ended && intent.speed) {
      intent.speed = 0;
      playRequest += 1;
      starting = false;
      emit('onPause');
    }
    sample();
  });
  listen('ended', () => {
    const { start: first, end: last } = bounds();
    if (intent.range && intent.speed && last > first) {
      pending = toRoute(first);
      issued = false;
      seekPending();
      resume();
    } else { intent.speed = 0; emit('onPause'); }
  });
  listen('error', () => emit('onError', video.error));

  // Sample the media clock for smooth readers, without inventing elapsed time.
  let scheduleFrame;
  function checkFrame(timestamp) {
    if (!active) return;
    const loopEdge = intent.speed && intent.range && video.currentTime >= bounds().end;
    if (loopEdge || timestamp - lastFrameSample >= 1000 / 30) {
      sample();
      lastFrameSample = timestamp;
    }
    frame = scheduleFrame();
  }
  scheduleFrame = () => video.requestVideoFrameCallback
    ? video.requestVideoFrameCallback(checkFrame) : globalThis.requestAnimationFrame?.(checkFrame) ?? null;
  frame = scheduleFrame();

  return {
    routeId: callbacks.routeId,
    update(next) {
      if (!active) return;
      intent = { ...intent, ...next };
      if (!Number.isFinite(intent.speed) || intent.speed < 0) intent.speed = 0;
      video.muted = intent.muted;
      if (intent.speed) video.playbackRate = Math.min(16, intent.speed);
      if (Number.isFinite(next.seekOffset) && next.seekRevision !== undefined && next.seekRevision !== revision) {
        revision = next.seekRevision;
        pending = next.seekOffset;
        issued = false;
      }
      seekPending();
      if (intent.speed) resume();
      else {
        playRequest += 1;
        starting = false;
        if (!video.paused) video.pause();
      }
    },
    dispose() {
      if (!active) return;
      active = false;
      playRequest += 1;
      listeners.forEach(([event, handler]) => video.removeEventListener(event, handler));
      if (frame !== null) {
        if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frame);
        else globalThis.cancelAnimationFrame?.(frame);
      }
    },
  };
}

export const bindMedia = (controller) => ({ type: Types.ACTION_BIND_MEDIA, controller });

// Transport commands stay in the original user-activation task, per store.
export const mediaMiddleware = ({ getState }) => {
  let bound = null;
  const sync = () => {
    const state = getState();
    bound?.update({ speed: state.desiredPlaySpeed,
      range: state.loop ? { start: state.loop.startTime, end: state.loop.startTime + state.loop.duration } : null,
      seekRevision: state.seekRevision || 0, seekOffset: state.seekOffset ?? state.offset ?? 0 });
  };
  return (next) => (action) => {
    if (action.type === Types.ACTION_BIND_MEDIA) {
      bound = action.controller;
      if (!bound) return;
      const controller = bound;
      sync();
      return () => { if (bound === controller) bound = null; };
    }
    const result = next(action);
    if ([Types.ACTION_PLAY, Types.ACTION_PAUSE, Types.ACTION_SEEK, Types.ACTION_LOOP, Types.ACTION_RESET].includes(action.type)) sync();
    return result;
  };
};
