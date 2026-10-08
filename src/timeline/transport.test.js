import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// NOTE: '.' must be imported before './transport' so the timeline/store/
// reducers module cycle evaluates in the same order as the app entry.
import { currentOffset } from '.';
import { TransportController } from './transport';
import { getVideoTime, registerVideoElement, unregisterVideoElement } from './videoClock';
import { ACTION_BUFFER_VIDEO, ACTION_VIDEO_ERROR, ACTION_VIDEO_SEEKING } from '../actions/types';
import { api } from '../api/backend';

vi.mock('../api/backend', () => ({
  api: {
    video: {
      getQcameraStreamUrl: vi.fn((fullname) => `https://example.com/${fullname}.m3u8`),
    },
  },
}));

vi.mock('hls.js', () => {
  const instances = [];
  const Hls = vi.fn(function hlsMock() {
    this.handlers = {};
    this.on = vi.fn((event, handler) => {
      this.handlers[event] = handler;
    });
    this.loadSource = vi.fn();
    this.attachMedia = vi.fn();
    this.destroy = vi.fn();
    instances.push(this);
  });
  Hls.Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };
  Hls.instances = instances;
  return { default: Hls };
});

class MockVideo extends EventTarget {
  constructor() {
    super();
    this.currentTimeSets = [];
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.readyState = 0;
    this.error = null;
    this.audioTracks = [];
    this._currentTime = 0;
    this._paused = true;
    this._playbackRate = 1;
    this._muted = false;
    this._src = '';
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this.currentTimeSets.push(value);
    this._currentTime = value;
  }

  get paused() {
    return this._paused;
  }

  get playbackRate() {
    return this._playbackRate;
  }

  set playbackRate(value) {
    this._playbackRate = value;
  }

  get muted() {
    return this._muted;
  }

  set muted(value) {
    this._muted = value;
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = value;
  }

  play() {
    this.playCalls += 1;
    this._paused = false;
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    this._paused = true;
  }

  load() {}

  removeAttribute() {}

  canPlayType() {
    return '';
  }
}

const baseRoute = {
  fullname: 'dongle|log',
  videoStartOffset: 5000,
  share_exp: 'exp',
  share_sig: 'sig',
};

function makeState(overrides = {}) {
  return {
    desiredPlaySpeed: 1,
    isBufferingVideo: false,
    isSeekingVideo: false,
    videoError: null,
    seekRequest: null,
    offset: 0,
    startTime: Date.now(),
    currentRoute: { ...baseRoute },
    loop: null,
    ...overrides,
  };
}

function makeStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  const dispatched = [];
  return {
    getState: () => state,
    setState: (next) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    dispatch: (action) => {
      dispatched.push(action);
      return action;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatched,
  };
}

function dispatchedTypes(store, type) {
  return store.dispatched.filter((action) => action.type === type);
}

describe('TransportController', () => {
  let video;
  let store;

  beforeEach(() => {
    video = new MockVideo();
    store = makeStore(makeState());
    vi.useRealTimers();
  });

  afterEach(() => {
    unregisterVideoElement();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createController(stateOverrides = {}, callbacks = {}) {
    if (Object.keys(stateOverrides).length > 0) {
      store.setState(makeState(stateOverrides));
    }
    const controller = new TransportController(video, store, callbacks);
    store.dispatched.length = 0;
    video.currentTimeSets.length = 0;
    video.playCalls = 0;
    video.pauseCalls = 0;
    return controller;
  }

  it('loads the route source through hls.js when native HLS is unavailable', () => {
    const controller = createController();
    expect(video.src).toEqual('');
    controller.destroy();
  });

  it('applies each seek intent exactly once', () => {
    const controller = createController();

    store.setState(makeState({ seekRequest: { offset: 15000, nonce: 7 } }));
    expect(video.currentTimeSets).toEqual([10]);

    // same nonce again: no replay
    store.setState(makeState({ seekRequest: { offset: 15000, nonce: 7 } }));
    expect(video.currentTimeSets).toEqual([10]);

    // newer nonce wins
    store.setState(makeState({ seekRequest: { offset: 25000, nonce: 8 } }));
    expect(video.currentTimeSets).toEqual([10, 20]);

    controller.destroy();
  });

  it('applies pause and play intents once', async () => {
    const controller = createController();

    store.setState(makeState({ desiredPlaySpeed: 0 }));
    expect(video.pauseCalls).toEqual(1);

    store.setState(makeState({ desiredPlaySpeed: 0 }));
    expect(video.pauseCalls).toEqual(1);

    store.setState(makeState({ desiredPlaySpeed: 2 }));
    expect(video.playCalls).toEqual(1);
    expect(video.playbackRate).toEqual(2);

    controller.destroy();
    await Promise.resolve();
  });

  it('never micro-adjusts the playback rate to chase drift', () => {
    const controller = createController({ desiredPlaySpeed: 2 });
    expect(video.playbackRate).toEqual(2);

    // timeupdate with the element far from any extrapolated time:
    // the rate must stay exactly what the user asked for
    video._currentTime = 3;
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.playbackRate).toEqual(2);

    controller.destroy();
  });

  it('traps playback inside the loop with a thrash guard', () => {
    const controller = createController({
      loop: { startTime: 10000, duration: 5000 },
    });

    video._currentTime = 20; // route offset 25000ms, past loop end 15000ms
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTimeSets).toEqual([5]);

    // still past the end on the next tick: guard blocks an immediate re-seek
    video._currentTime = 20;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTimeSets).toEqual([5]);

    controller.destroy();
  });

  it('drives the buffering state from element events only', () => {
    const controller = createController();

    video.dispatchEvent(new Event('waiting'));
    expect(dispatchedTypes(store, ACTION_BUFFER_VIDEO).at(-1).buffering).toEqual(true);

    video.dispatchEvent(new Event('seeking'));
    expect(dispatchedTypes(store, ACTION_BUFFER_VIDEO).at(-1).buffering).toEqual(true);
    expect(dispatchedTypes(store, ACTION_VIDEO_SEEKING).at(-1).seeking).toEqual(true);

    // a seek that lands with no data yet keeps buffering: no overlay flicker
    video.readyState = 1;
    video.dispatchEvent(new Event('seeked'));
    expect(dispatchedTypes(store, ACTION_BUFFER_VIDEO).at(-1).buffering).toEqual(true);
    expect(dispatchedTypes(store, ACTION_VIDEO_SEEKING).at(-1).seeking).toEqual(false);

    // a seek that lands on a real frame clears it
    video.readyState = 3;
    video.dispatchEvent(new Event('seeked'));
    expect(dispatchedTypes(store, ACTION_BUFFER_VIDEO).at(-1).buffering).toEqual(false);

    video.dispatchEvent(new Event('playing'));
    expect(dispatchedTypes(store, ACTION_BUFFER_VIDEO).at(-1).buffering).toEqual(false);
    expect(dispatchedTypes(store, ACTION_VIDEO_ERROR).at(-1).error).toEqual(null);

    video.dispatchEvent(new Event('canplay'));
    expect(dispatchedTypes(store, ACTION_BUFFER_VIDEO).at(-1).buffering).toEqual(false);

    controller.destroy();
  });

  it('keeps transient hls stalls in buffering with no error UI', async () => {
    const Hls = (await import('hls.js')).default;
    const controller = createController();
    const hls = Hls.instances.at(-1);

    hls.handlers.hlsError(null, { fatal: false, type: 'mediaError', details: 'bufferStalledError' });
    expect(dispatchedTypes(store, ACTION_VIDEO_ERROR)).toEqual([]);

    controller.destroy();
  });

  it('shows a clear message for fatal hls 404s and destroys the hls instance', async () => {
    const Hls = (await import('hls.js')).default;
    const controller = createController();
    const hls = Hls.instances.at(-1);

    hls.handlers.hlsError(null, { fatal: true, type: 'networkError', response: { code: 404 } });
    const errors = dispatchedTypes(store, ACTION_VIDEO_ERROR);
    expect(errors.at(-1).error).toEqual('This video segment has not uploaded yet or has been deleted.');
    expect(hls.destroy).toHaveBeenCalled();

    controller.destroy();
  });

  it('retries transient network errors with backoff, then fails', async () => {
    vi.useFakeTimers();
    const controller = createController();
    const loadCalls = api.video.getQcameraStreamUrl.mock.calls.length;

    const fireNetworkError = () => {
      video.error = { code: 2 }; // MEDIA_ERR_NETWORK
      video.dispatchEvent(new Event('error'));
      // transient failures stay in buffering: no error UI, only null-clearing dispatches
      const surfaced = dispatchedTypes(store, ACTION_VIDEO_ERROR).filter((action) => action.error !== null);
      expect(surfaced).toEqual([]);
    };

    fireNetworkError();
    await vi.advanceTimersByTimeAsync(1000);
    fireNetworkError();
    await vi.advanceTimersByTimeAsync(2000);
    fireNetworkError();
    await vi.advanceTimersByTimeAsync(4000);

    // three retries reloaded the source
    expect(api.video.getQcameraStreamUrl.mock.calls.length).toEqual(loadCalls + 3);

    // fourth failure exhausts the backoff and surfaces the error
    video.error = { code: 2 };
    video.dispatchEvent(new Event('error'));
    const errors = dispatchedTypes(store, ACTION_VIDEO_ERROR);
    expect(errors.at(-1).error).toEqual('Unable to load video. Check your network connection.');

    controller.destroy();
  });

  it('retry() clears the error and reloads the source', () => {
    const controller = createController();
    const loadCallsBefore = api.video.getQcameraStreamUrl.mock.calls.length;

    controller.fail('Unable to load video');
    expect(dispatchedTypes(store, ACTION_VIDEO_ERROR).at(-1).error).toEqual('Unable to load video');

    controller.retry();
    const errors = dispatchedTypes(store, ACTION_VIDEO_ERROR);
    expect(errors.at(-1).error).toEqual(null);
    expect(api.video.getQcameraStreamUrl.mock.calls.length).toBeGreaterThan(loadCallsBefore);

    controller.destroy();
  });

  it('registers the element with the video clock and unregisters on destroy', () => {
    const controller = createController();
    video.readyState = 3;
    video._currentTime = 10;
    expect(getVideoTime()).toEqual(10);

    controller.destroy();
    expect(getVideoTime()).toEqual(null);
  });

  it('notifies about audio tracks on native playback', () => {
    const onAudioStatusChange = vi.fn();
    const controller = createController({}, { onAudioStatusChange });
    video.audioTracks = [{ id: 'audio' }];
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(onAudioStatusChange).toHaveBeenCalledWith(true);
    controller.destroy();
  });

  it('re-asserts play state and speed when the route changes', () => {
    const controller = createController({ desiredPlaySpeed: 2 });
    expect(video.playCalls).toEqual(0);

    store.setState(makeState({
      desiredPlaySpeed: 2,
      currentRoute: { ...baseRoute, fullname: 'dongle|other' },
    }));
    // new media resource: play() and the discrete speed are applied again
    expect(video.playCalls).toEqual(1);
    expect(video.playbackRate).toEqual(2);

    controller.destroy();
  });

  it('positions a new stream at the timeline offset on metadata', () => {
    const controller = createController();
    video.currentTimeSets.length = 0;

    // paused 35s into the route; videoStartOffset is 5000ms
    store.setState(makeState({ desiredPlaySpeed: 0, offset: 35000, startTime: Date.now() }));
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTimeSets.at(-1)).toEqual(30);

    controller.destroy();
  });

  it('starts a fresh route at the loop start', () => {
    const controller = createController({
      offset: null,
      loop: { startTime: 10000, duration: 5000 },
    });
    video.currentTimeSets.length = 0;

    video.dispatchEvent(new Event('loadedmetadata'));
    // (10000 - 5000) / 1000, matching the old first-seek behavior
    expect(video.currentTimeSets.at(-1)).toEqual(5);

    controller.destroy();
  });

  it('stops reacting after destroy', () => {
    const controller = createController();
    controller.destroy();
    const dispatchedBefore = store.dispatched.length;

    video.dispatchEvent(new Event('waiting'));
    video.dispatchEvent(new Event('timeupdate'));
    store.setState(makeState({ desiredPlaySpeed: 0 }));

    expect(store.dispatched.length).toEqual(dispatchedBefore);
    expect(video.pauseCalls).toEqual(0);
  });
});

describe('videoClock', () => {
  afterEach(() => {
    unregisterVideoElement();
  });

  it('returns null with no element or before metadata', () => {
    expect(getVideoTime()).toEqual(null);
    const video = new MockVideo();
    registerVideoElement(video);
    expect(getVideoTime()).toEqual(null);
    video.readyState = 1;
    video._currentTime = 42;
    expect(getVideoTime()).toEqual(42);
  });
});

describe('currentOffset with a driving video', () => {
  afterEach(() => {
    unregisterVideoElement();
  });

  it('prefers the video clock over the wall clock', () => {
    const video = new MockVideo();
    video.readyState = 3;
    video._currentTime = 10;
    registerVideoElement(video);

    const state = makeState({ currentRoute: { ...baseRoute, videoStartOffset: 5000 } });
    // video time 10s + start offset 5000ms
    expect(currentOffset(state)).toEqual(15000);
  });

  it('falls back to the wall clock without a video', () => {
    const state = makeState({ offset: 7000, startTime: Date.now(), desiredPlaySpeed: 0 });
    expect(currentOffset(state)).toEqual(7000);
  });
});
