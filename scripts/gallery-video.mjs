// Serialized into the screenshot browser only; production playback is untouched.
// No media clock or native buffering animation should run against a fake playlist.
export function installGalleryVideo(duration) {
  const prototype = HTMLMediaElement.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(prototype);
  const states = new WeakMap();
  const emit = (video, ...events) => queueMicrotask(() => {
    if (video.isConnected) events.forEach(name => video.dispatchEvent(new Event(name)));
  });

  // Both bundled hls.js and older ReactPlayer builds take the native HLS path.
  globalThis.MediaSource = undefined;
  globalThis.ManagedMediaSource = undefined;
  globalThis.WebKitMediaSource = undefined;
  const canPlayType = prototype.canPlayType;
  prototype.canPlayType = function (type) {
    return /mpegurl/i.test(type) ? 'probably' : canPlayType.call(this, type);
  };
  Object.defineProperty(prototype, 'src', {
    configurable: true,
    get() { return states.get(this)?.src ?? descriptors.src.get.call(this); },
    set(src) {
      if (!src.includes('qcamera.m3u8')) {
        states.delete(this);
        descriptors.src.set.call(this, src);
        return;
      }
      states.set(this, { src, currentTime: 0, paused: true });
      emit(this, 'loadedmetadata', 'loadeddata', 'canplay');
    },
  });
  for (const [name, value] of Object.entries({ readyState: 4, duration, ended: false })) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      get() { return states.has(this) ? value : descriptors[name].get.call(this); },
    });
  }
  Object.defineProperty(prototype, 'paused', {
    configurable: true,
    get() { return states.get(this)?.paused ?? descriptors.paused.get.call(this); },
  });
  Object.defineProperty(prototype, 'currentTime', {
    configurable: true,
    get() { return states.get(this)?.currentTime ?? descriptors.currentTime.get.call(this); },
    set(time) {
      const state = states.get(this);
      if (!state) { descriptors.currentTime.set.call(this, time); return; }
      state.currentTime = Math.max(0, Math.min(duration, time));
      emit(this, 'seeking', 'timeupdate', 'seeked');
    },
  });
  for (const name of ['buffered', 'seekable']) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      get() {
        return states.has(this) ? { length: 1, start: () => 0, end: () => duration }
          : descriptors[name].get.call(this);
      },
    });
  }
  for (const name of ['load', 'play', 'pause']) {
    const original = prototype[name];
    prototype[name] = function () {
      const state = states.get(this);
      if (!state) return original.call(this);
      if (name === 'load') emit(this, 'loadedmetadata', 'loadeddata', 'canplay');
      else if (name === 'play') {
        if (state.paused) { state.paused = false; emit(this, 'play', 'playing'); }
        return Promise.resolve();
      } else if (!state.paused) { state.paused = true; emit(this, 'pause'); }
    };
  }
}
