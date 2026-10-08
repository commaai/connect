import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';

import * as Types from '../../actions/types';
import { currentOffset, playVideo, setVideoMuted } from '../../timeline';
import { pause, play, reducer, resetPlayback, seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const hlsMock = vi.hoisted(() => ({ instances: [], supported: true }));

vi.mock('../../store', () => ({ default: { getState: () => ({}) } }));
vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: (name, exp, sig) => `https://api.test/v1/route/${name}/qcamera.m3u8?sig=${sig}` } },
}));
vi.mock('hls.js', () => {
  class FakeHls {
    static Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs', MEDIA_DETACHING: 'hlsMediaDetaching', FRAG_LOADED: 'hlsFragLoaded' };

    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };

    static ErrorDetails = { FRAG_LOAD_ERROR: 'fragLoadError' };

    static isSupported() { return hlsMock.supported; }

    constructor(config) {
      this.config = config;
      this.handlers = {};
      this.destroyed = false;
      this.recoverMediaError = vi.fn(() => this.detachMedia());
      hlsMock.instances.push(this);
    }

    on(event, fn) { (this.handlers[event] ||= []).push(fn); }

    trigger(event, data) { (this.handlers[event] || []).forEach((fn) => fn(event, data)); }

    loadSource(src) { this.src = src; }

    attachMedia(media) { this.media = media; }

    // Like the real detach, which runs load() on the element: it pauses without a pause event.
    detachMedia() {
      this.trigger('hlsMediaDetaching');
      if (this.media) Object.assign(this.media, { paused: true, readyState: 0 });
    }

    destroy() { this.destroyed = true; this.detachMedia(); }

    emit(event, data) { act(() => this.trigger(event, data)); }
  }
  return { default: FakeHls };
});

// Fake HTMLMediaElement state: tests drive it like a browser would, via properties and events.
const media = new WeakMap();
let prepareNext = null;
const fake = (el) => {
  if (!media.has(el)) {
    const state = {
      readyState: 0, paused: true, seeking: false, ended: false, error: null, muted: false,
      currentTime: 0, duration: NaN, playbackRate: 1, defaultPlaybackRate: 1, audioTracks: undefined,
      seeks: [], rates: [], plays: 0, nativeHls: false, playResult: null,
    };
    prepareNext?.(state);
    media.set(el, state);
  }
  return media.get(el);
};
const saved = {};
beforeAll(() => {
  const proto = HTMLMediaElement.prototype;
  const define = (name, descriptor) => {
    saved[name] = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });
  };
  for (const key of ['readyState', 'paused', 'seeking', 'ended', 'error', 'muted', 'duration', 'defaultPlaybackRate', 'audioTracks']) {
    define(key, { get() { return fake(this)[key]; }, set(v) { fake(this)[key] = v; } });
  }
  define('currentTime', {
    get() { return fake(this).currentTime; },
    set(v) {
      const m = fake(this);
      // Browsers clamp seeks to the media duration.
      Object.assign(m, { currentTime: Math.min(v, m.duration) || v, seeking: true, ended: false });
      m.seeks.push(v);
    },
  });
  define('playbackRate', {
    get() { return fake(this).playbackRate; },
    set(v) { fake(this).playbackRate = v; fake(this).rates.push(v); },
  });
  define('play', {
    value() {
      const m = fake(this);
      m.plays += 1;
      if (m.playResult) return m.playResult(m);
      m.paused = false;
      return Promise.resolve();
    },
  });
  define('pause', { value() { fake(this).paused = true; } });
  define('load', { value() {} });
  define('canPlayType', { value(type) { return fake(this).nativeHls && type.includes('mpegurl') ? 'maybe' : ''; } });
});
afterAll(() => {
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(HTMLMediaElement.prototype, name, descriptor);
    else delete HTMLMediaElement.prototype[name];
  }
});

const route = { fullname: 'dongle|route-a', share_exp: '1', share_sig: 'a', duration: 60000, videoStartOffset: null };
const routeB = { ...route, fullname: 'dongle|route-b' };

async function setup(overrides = {}, { prepare } = {}) {
  hlsMock.instances.length = 0;
  hlsMock.supported = true;
  const store = createStore(
    (state, action) => (action.type === 'PATCH' ? { ...state, ...action.patch } : reducer(state, action)),
    {
      desiredPlaySpeed: 1, offset: 0, seekId: 0,
      loop: { startTime: 0, duration: 60000 }, currentRoute: route, ...overrides,
    },
    applyMiddleware(thunk),
  );
  const onAudio = vi.fn();
  // The element is configured as soon as it exists, since mounting already starts playback.
  prepareNext = prepare;
  const view = render(
    <Provider store={store}><DriveVideo isMuted onAudioStatusChange={onAudio} /></Provider>,
  );
  prepareNext = null;
  const video = view.container.querySelector('video');
  const m = fake(video);
  const fire = (type) => act(() => { video.dispatchEvent(new Event(type)); });
  const dispatch = (action) => act(() => { store.dispatch(action); });
  const hls = () => hlsMock.instances[hlsMock.instances.length - 1];
  const ready = (readyState = 4) => { m.readyState = readyState; fire('loadedmetadata'); fire('canplay'); };
  const seeked = () => { m.seeking = false; fire('seeked'); };
  // Natural playback moves currentTime without a seek.
  const progress = (time) => { Object.assign(m, { currentTime: time, seeking: false }); fire('timeupdate'); };
  await waitFor(() => expect(hlsMock.instances.length > 0 || prepare?.native).toBe(true));
  return { store, video, m, fire, dispatch, hls, ready, seeked, progress, onAudio, ...view };
}

const offset = (store) => currentOffset(store.getState());
const spinner = () => screen.queryByRole('progressbar');
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
// A play request the browser accepts but has not started yet: paused flips to false immediately.
const pendingPlay = (rejects) => (m) => {
  m.paused = false;
  return new Promise((_, reject) => { rejects.push(reject); });
};
const videoStartArrives = (store, videoStartOffset) => act(() => {
  store.dispatch({ type: 'PATCH', patch: { currentRoute: { ...route, videoStartOffset } } });
  store.dispatch({ type: Types.ACTION_UPDATE_ROUTE_EVENTS, fullname: route.fullname });
});

describe('DriveVideo', () => {
  it('defers seeks until metadata, applies only the latest, and repeats an identical explicit seek', async () => {
    const { store, m, dispatch, ready, seeked, progress } = await setup();
    dispatch(seek(5000));
    dispatch(seek(9000));
    expect(m.seeks).toEqual([]);
    expect(offset(store)).toBe(9000);

    ready();
    expect(m.seeks).toEqual([9]);
    seeked();
    progress(12);
    expect(store.getState()).toMatchObject({ offset: 12000, seekId: 2 });

    dispatch(seek(9000));
    expect(m.seeks).toEqual([9, 9]);
  });

  it('starts hls.js at the requested position instead of the beginning', async () => {
    const { hls } = await setup({ offset: 30000, seekId: 4 });
    expect(hls().config.startPosition).toBe(30);
    expect(hls().src).toContain('route-a/qcamera.m3u8');
  });

  it('records media progress without ever seeking, and never overwrites an undelivered seek', async () => {
    const { store, video, m, ready, seeked, progress } = await setup();
    ready();
    seeked();
    progress(3);
    progress(3.25);
    expect(store.getState()).toMatchObject({ offset: 3250, seekId: 0 });
    expect(m.seeks).toEqual([]);

    act(() => {
      store.dispatch(seek(20000));
      // timeupdate that lands before React delivers the seek to the component
      video.dispatchEvent(new Event('timeupdate'));
      expect(store.getState().offset).toBe(20000);
      expect(offset(store)).toBe(20000);
    });
    expect(m.seeks).toEqual([20]);
    expect(offset(store)).toBe(20000);
  });

  it('seeks while paused without starting playback and only shows the spinner while seeking', async () => {
    const { store, m, dispatch, ready, seeked } = await setup({ desiredPlaySpeed: 0 });
    ready(2);
    expect(spinner()).toBeNull();
    dispatch(seek(15000));
    expect(m.seeks).toEqual([15]);
    expect(m.plays).toBe(0);
    expect(spinner()).toBeInTheDocument();
    seeked();
    expect(spinner()).toBeNull();
    expect(store.getState()).toMatchObject({ offset: 15000, desiredPlaySpeed: 0 });
  });

  it('maps media time through a late first-frame offset without re-seeking', async () => {
    const { store, m, dispatch, ready, seeked, progress } = await setup();
    ready();
    dispatch(seek(10000));
    seeked();
    expect(m.seeks).toEqual([10]);
    dispatch({ type: 'PATCH', patch: { currentRoute: { ...route, videoStartOffset: 3000 } } });
    expect(offset(store)).toBe(13000);
    expect(m.seeks).toEqual([10]);
    progress(11);
    expect(store.getState().offset).toBe(14000);
    dispatch(seek(10000));
    expect(m.seeks).toEqual([10, 7]);
  });

  describe('when the video start arrives after a cold deep link to a range', () => {
    const clip = { offset: 10000, seekId: 1, loop: { startTime: 10000, duration: 10000 } };

    it('seeks once more so the range still begins at its start', async () => {
      const { store, m, ready, seeked, progress } = await setup(clip);
      ready();
      seeked();
      progress(10.5);
      expect(m.seeks).toEqual([10]);
      videoStartArrives(store, 3000);
      expect(m.seeks).toEqual([10, 7]);
      expect(offset(store)).toBe(10000);
      seeked();
      expect(store.getState()).toMatchObject({ offset: 10000, seekId: 1 });
      videoStartArrives(store, 3000); // later refreshes of the same metadata
      expect(m.seeks).toEqual([10, 7]);
    });

    it('uses the video start directly when it arrives before the media metadata', async () => {
      const { store, m, ready } = await setup(clip);
      videoStartArrives(store, 3000);
      ready();
      expect(m.seeks).toEqual([7]);
    });

    it('keeps a later user seek instead of returning to the range start', async () => {
      const { store, m, dispatch, ready, seeked } = await setup(clip);
      ready();
      seeked();
      dispatch(seek(15000));
      seeked();
      videoStartArrives(store, 3000);
      expect(m.seeks).toEqual([10, 15]);
      expect(offset(store)).toBe(18000);
    });
  });

  it('never rewinds whole-route playback when the video start arrives', async () => {
    const { store, m, ready, seeked, progress } = await setup();
    ready();
    seeked();
    progress(5);
    videoStartArrives(store, 3000);
    expect(store.getState().loop).toEqual({ startTime: 3000, duration: 57000 });
    expect(m.seeks).toEqual([]);
    expect(offset(store)).toBe(8000);
  });

  it('starts a range selected before the position with a single seek to its start', async () => {
    const { m, dispatch, ready, seeked, progress } = await setup();
    ready();
    progress(30);
    dispatch(selectLoop(10000, 12000));
    seeked();
    progress(10.1);
    expect(m.seeks).toEqual([10]);
  });

  it('follows pauses and plays that come from outside the app controls', async () => {
    const { store, m, fire, dispatch, ready } = await setup();
    ready();
    dispatch(play(2));
    expect(m.paused).toBe(false);
    m.paused = true;
    fire('pause');
    expect(store.getState().desiredPlaySpeed).toBe(0);
    m.paused = false;
    fire('play');
    expect(store.getState().desiredPlaySpeed).toBe(2);
  });

  it('keeps a pause made while a new route starts, even when the route\'s own play event arrives after it', async () => {
    const { store, video, m, fire, ready, hls } = await setup({ desiredPlaySpeed: 0, offset: 7000, seekId: 1 });
    ready();
    expect(m.paused).toBe(true);
    // Selecting another route resets playback to play (as pushTimelineRange does).
    act(() => {
      store.dispatch({ type: 'PATCH', patch: { currentRoute: routeB } });
      store.dispatch(selectLoop(0, 60000));
      store.dispatch(resetPlayback());
    });
    expect(hls().src).toContain('route-b');
    expect(m.plays).toBe(1);
    expect(m.paused).toBe(false);
    act(() => {
      // The user pauses before React delivers it, and only then does the queued play event run.
      store.dispatch(pause());
      video.dispatchEvent(new Event('play'));
      expect(store.getState().desiredPlaySpeed).toBe(0);
    });
    expect(m.paused).toBe(true);
    ready();
    expect(m.paused).toBe(true);
    expect(m.plays).toBe(1);
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 0, offset: 0 });

    // A play from outside the app (e.g. lock screen) on the new route is still followed.
    m.paused = false;
    fire('play');
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });

  it('keeps a pause that follows a gesture play before the gesture\'s play event arrives', async () => {
    const { store, video, m, ready } = await setup({ desiredPlaySpeed: 0 });
    ready();
    act(() => {
      // The controls play inside the click, then record it.
      playVideo(2);
      store.dispatch(play(2));
    });
    expect(m.paused).toBe(false);
    act(() => {
      store.dispatch(pause());
      video.dispatchEvent(new Event('play'));
      expect(store.getState().desiredPlaySpeed).toBe(0);
    });
    expect(m.paused).toBe(true);
    expect(m.playbackRate).toBe(2);
  });

  it('shows paused after an interruption before metadata, so a single tap resumes', async () => {
    const rejects = [];
    const { store, m, fire, dispatch, ready } = await setup({}, { prepare: (s) => { s.playResult = pendingPlay(rejects); } });
    expect(m.paused).toBe(false);
    // The system pauses the element while play() still waits for data.
    m.paused = true;
    fire('pause');
    expect(store.getState().desiredPlaySpeed).toBe(1);
    await act(async () => rejects[0](abortError()));
    expect(store.getState().desiredPlaySpeed).toBe(0);
    ready();
    expect(m.paused).toBe(true);
    expect(m.plays).toBe(1);
    expect(spinner()).toBeNull();

    m.playResult = null;
    playVideo(1);
    dispatch(play(1));
    expect(m.paused).toBe(false);
    expect(m.plays).toBe(2);
  });

  it('keeps playing through a media source reset that aborts the pending play request', async () => {
    const rejects = [];
    const { store, m, fire, ready, hls } = await setup({}, { prepare: (s) => { s.playResult = pendingPlay(rejects); } });
    // hls.js resets the media source itself to recover some media errors.
    act(() => hls().recoverMediaError());
    fire('pause');
    await act(async () => rejects[0](abortError()));
    expect(store.getState().desiredPlaySpeed).toBe(1);
    expect(spinner()).toBeInTheDocument();
    ready();
    expect(m.paused).toBe(false);
    expect(m.plays).toBe(2);
    // Only requests made before the reset are discounted; the resumed one can still be interrupted.
    m.paused = true;
    await act(async () => rejects[1](abortError()));
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('wraps exactly at the loop end at 8x and loops on ended without pausing', async () => {
    const { store, m, fire, dispatch, ready, seeked, progress } = await setup({ desiredPlaySpeed: 8, offset: 10000, seekId: 1, loop: { startTime: 10000, duration: 5000 } });
    ready();
    seeked();
    expect(m.playbackRate).toBe(8);
    expect(m.seeks).toEqual([10]);
    progress(14.9);
    expect(m.seeks).toEqual([10]);
    progress(15.01);
    expect(m.seeks).toEqual([10, 10]);
    seeked();
    expect(store.getState()).toMatchObject({ offset: 10000, seekId: 1, desiredPlaySpeed: 8 });

    dispatch(selectLoop(0, 60000));
    progress(59.9);
    Object.assign(m, { paused: true, ended: true });
    fire('pause');
    fire('ended');
    expect(store.getState().desiredPlaySpeed).toBe(8);
    expect(m.seeks.at(-1)).toBe(0);
    expect(m.paused).toBe(false);
    expect(m.rates.every((rate) => rate === 8)).toBe(true);
  });

  it('starts playback only on play commands, never from observed progress', async () => {
    const { m, dispatch, ready, seeked, progress } = await setup();
    ready();
    seeked();
    const { plays } = m;
    m.paused = true; // paused natively while its pause event is still queued
    progress(3);
    dispatch(seek(5000));
    seeked();
    expect(m.plays).toBe(plays);
    dispatch(play(2));
    expect(m.plays).toBe(plays + 1);
  });

  it('stops at the end without a loop and replays from the start on the next play', async () => {
    const { store, m, fire, dispatch, ready, seeked, progress } = await setup({ loop: null });
    ready();
    seeked();
    progress(60);
    Object.assign(m, { paused: true, ended: true });
    fire('pause');
    fire('ended');
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(m.seeks).toEqual([]);
    expect(spinner()).toBeNull();
    dispatch(play(1));
    expect(m.seeks).toEqual([0]);
    expect(m.paused).toBe(false);
  });

  it('clamps a seek past the media end natively, then loops once without oscillating', async () => {
    const { store, m, fire, dispatch, ready, seeked } = await setup({}, { prepare: (s) => { s.duration = 58; } });
    ready();
    seeked();
    dispatch(seek(59000));
    seeked();
    expect(store.getState().offset).toBe(58000);
    Object.assign(m, { paused: true, ended: true });
    fire('pause');
    fire('ended');
    expect(m.seeks).toEqual([59, 0]);
    expect(m.paused).toBe(false);
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });

  it('stops instead of looping when the selected range lies past the media end', async () => {
    const { store, m, fire, ready, seeked } = await setup(
      { offset: 58500, seekId: 1, loop: { startTime: 58500, duration: 1500 } },
      { prepare: (s) => { s.duration = 58; } },
    );
    ready();
    seeked();
    Object.assign(m, { paused: true, ended: true });
    fire('pause');
    fire('ended');
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(m.seeks).toEqual([58.5]);
    expect(m.paused).toBe(true);
  });

  it('keeps an empty selection paused without spinning, and pauses if the selection empties while playing', async () => {
    const { store, m, dispatch, ready, seeked, progress } = await setup({
      loop: { startTime: 1000, duration: 0 }, offset: 1000, seekId: 1, currentRoute: { ...route, videoStartOffset: 3000 },
    });
    expect(store.getState().desiredPlaySpeed).toBe(0);
    ready();
    seeked();
    playVideo(1);
    dispatch(play(1));
    expect(m.plays).toBe(0);
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(spinner()).toBeNull();

    dispatch({ type: 'PATCH', patch: { loop: { startTime: 3000, duration: 10000 } } });
    dispatch(play(1));
    expect(m.paused).toBe(false);
    dispatch({ type: 'PATCH', patch: { loop: { startTime: 3000, duration: 0 } } });
    progress(1);
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(m.paused).toBe(true);
    expect(m.plays).toBe(1);
  });

  it('adopts a playback rate changed outside the app and ignores its own rate changes', async () => {
    const { store, m, fire, dispatch, ready } = await setup();
    ready();
    dispatch(play(2));
    fire('ratechange');
    expect(store.getState().desiredPlaySpeed).toBe(2);
    m.playbackRate = 1.5; // set by the browser, not through the element
    fire('ratechange');
    expect(store.getState().desiredPlaySpeed).toBe(1.5);
    expect(m.defaultPlaybackRate).toBe(1.5);
    fire('ratechange');
    expect(store.getState().desiredPlaySpeed).toBe(1.5);
    expect(m.rates).toEqual([2]);
  });

  it('keeps a fixed playback rate: pausing never sets a zero rate and seeks never nudge it', async () => {
    const { m, dispatch, ready, seeked, progress } = await setup();
    ready();
    dispatch(play(4));
    progress(2);
    dispatch(seek(30000));
    seeked();
    dispatch(pause());
    expect(m.paused).toBe(true);
    dispatch(play(0.1));
    expect(m.rates).toEqual([4, 0.1]);
  });

  it('shows paused controls without a spinner when autoplay is denied', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const { store } = await setup({}, { prepare: (m) => { m.playResult = () => Promise.reject(denied); } });
    await waitFor(() => expect(store.getState().desiredPlaySpeed).toBe(0));
    await waitFor(() => expect(spinner()).toBeNull());
  });

  it('plays and unmutes synchronously from a user gesture', async () => {
    const { video, m, ready } = await setup({ desiredPlaySpeed: 0 });
    ready();
    expect(video.muted).toBe(true);
    playVideo(2);
    expect(m.paused).toBe(false);
    expect(m.playbackRate).toBe(2);
    setVideoMuted(false);
    expect(video.muted).toBe(false);
  });

  it('recovers hls.js decode errors in place at the current position a bounded number of times', async () => {
    const { store, m, fire, ready, seeked, progress, dispatch, hls } = await setup();
    ready();
    dispatch(play(2));
    progress(42);
    hls().emit('hlsError', { fatal: true, type: 'mediaError', details: 'bufferAppendError' });
    expect(hls().recoverMediaError).toHaveBeenCalledTimes(1);
    m.currentTime = 0; // the reattached media source starts from zero
    ready();
    expect(m.seeks.at(-1)).toBe(42);
    expect(m.paused).toBe(false);
    seeked();
    fire('playing'); // playing again does not renew the budget

    m.error = { code: 3 }; // MEDIA_ERR_DECODE reported by the element
    fire('error');
    expect(hls().recoverMediaError).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Retry')).toBeNull();
    hls().emit('hlsError', { fatal: true, type: 'mediaError', details: 'bufferAppendError' });
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    expect(hls().recoverMediaError).toHaveBeenCalledTimes(2);
    expect(hlsMock.instances).toHaveLength(1);
    expect(m.paused).toBe(true);
    expect(store.getState()).toMatchObject({ offset: 42000, desiredPlaySpeed: 0 });
  });

  it('offers Retry as soon as hls.js gives up on the network, and Retry resumes at the position and speed', async () => {
    const { store, m, ready, seeked, progress, dispatch, hls } = await setup();
    ready();
    dispatch(play(2));
    progress(42);
    hls().emit('hlsError', { fatal: false, type: 'networkError', details: 'fragLoadError' });
    expect(screen.queryByText(/Unable to load/)).toBeNull();

    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(screen.getByText('Unable to load video. Check network connection.')).toBeInTheDocument();
    expect(spinner()).toBeNull();
    expect(hls().destroyed).toBe(true);
    expect(hlsMock.instances).toHaveLength(1);
    expect(offset(store)).toBe(42000);
    expect(m.paused).toBe(true);
    expect(store.getState().desiredPlaySpeed).toBe(0);

    act(() => {
      screen.getByText('Retry').click();
      expect(m.paused).toBe(false); // inside the click, before React re-renders
      expect(m.playbackRate).toBe(2);
    });
    expect(hlsMock.instances).toHaveLength(2);
    expect(hls().config.startPosition).toBe(42);
    expect(m.paused).toBe(false);
    expect(store.getState().desiredPlaySpeed).toBe(2);
    m.currentTime = 0; // a fresh source starts from zero
    ready();
    expect(m.seeks.at(-1)).toBe(42);
    seeked();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(hlsMock.instances).toHaveLength(2);
  });

  it('pauses on a terminal failure, and Play reloads once at the position and speed inside the gesture', async () => {
    const { store, video, m, ready, seeked, progress, dispatch, hls } = await setup();
    ready();
    dispatch(play(2));
    progress(42);
    const old = hls();
    old.emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(m.paused).toBe(true);
    expect(offset(store)).toBe(42000);
    expect(spinner()).toBeNull();

    const { plays } = m;
    act(() => {
      playVideo(2);
      // Asserted before the store hears of the play, so the request is part of the gesture.
      expect(hlsMock.instances).toHaveLength(2);
      expect(m.plays).toBe(plays + 1);
      expect(m.paused).toBe(false);
      expect(m.playbackRate).toBe(2);
      store.dispatch(play(2));
    });
    expect(hlsMock.instances).toHaveLength(2);
    expect(hls().media).toBe(video);
    expect(hls().config.startPosition).toBe(42);
    expect(hls().destroyed).toBe(false);
    expect(screen.queryByText('Retry')).toBeNull();
    expect(store.getState().desiredPlaySpeed).toBe(2);
    m.currentTime = 0; // a fresh source starts from zero
    ready();
    expect(m.seeks.at(-1)).toBe(42);
    seeked();
    expect(offset(store)).toBe(42000);
    expect(m.plays).toBe(plays + 1);
    expect(hlsMock.instances).toHaveLength(2);
  });

  it('reloads a failed source at a seek made while it had no source', async () => {
    const { store, m, ready, seeked, progress, dispatch, hls } = await setup();
    ready();
    dispatch(play(2));
    progress(42);
    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    dispatch(seek(51000));
    expect(hlsMock.instances).toHaveLength(1);
    expect(m.seeks).toEqual([]);
    expect(offset(store)).toBe(51000);

    act(() => { playVideo(2); store.dispatch(play(2)); });
    expect(hlsMock.instances).toHaveLength(2);
    expect(hls().config.startPosition).toBe(51);
    m.currentTime = 0;
    ready();
    expect(m.seeks).toEqual([51]);
    seeked();
    expect(store.getState()).toMatchObject({ offset: 51000, desiredPlaySpeed: 2 });
  });

  it('reloads a failed source on a play command that does not come through the gesture bridge', async () => {
    const { store, m, ready, progress, dispatch, hls } = await setup();
    ready();
    dispatch(play(2));
    progress(42);
    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    dispatch(play(4));
    expect(hlsMock.instances).toHaveLength(2);
    expect(hls().config.startPosition).toBe(42);
    expect(m.paused).toBe(false);
    expect(m.playbackRate).toBe(4);
    expect(store.getState().desiredPlaySpeed).toBe(4);
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('keeps a source that failed while paused paused on Retry', async () => {
    const { store, m, ready, seeked, hls } = await setup({ desiredPlaySpeed: 0, offset: 20000, seekId: 1 });
    ready();
    seeked();
    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    const { plays } = m;
    fireEvent.click(screen.getByText('Retry'));
    expect(hlsMock.instances).toHaveLength(2);
    expect(hls().config.startPosition).toBe(20);
    m.currentTime = 0;
    ready();
    expect(m.seeks.at(-1)).toBe(20);
    expect(m.paused).toBe(true);
    expect(m.plays).toBe(plays);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('keeps the reloaded source safe from the failed source\'s late events and promises', async () => {
    const rejects = [];
    const { store, m, ready, hls } = await setup({}, { prepare: (s) => { s.playResult = pendingPlay(rejects); } });
    await waitFor(() => expect(rejects).toHaveLength(1));
    ready();
    const old = hls();
    old.emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(store.getState().desiredPlaySpeed).toBe(0);

    m.playResult = null;
    act(() => { playVideo(1); store.dispatch(play(1)); });
    const current = hls();
    expect(current).not.toBe(old);
    await act(async () => rejects[0](abortError()));
    old.emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(current.destroyed).toBe(false);
    expect(screen.queryByText(/Unable to load/)).toBeNull();
    expect(store.getState().desiredPlaySpeed).toBe(1);
    expect(m.paused).toBe(false);
  });

  it('clears a failure on a route change and does not carry the failed route\'s resume intent', async () => {
    const { store, m, ready, progress, dispatch, hls } = await setup();
    ready();
    progress(42);
    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    expect(store.getState().desiredPlaySpeed).toBe(0);

    act(() => {
      store.dispatch({ type: 'PATCH', patch: { currentRoute: routeB } });
      store.dispatch(resetPlayback());
    });
    expect(screen.queryByText(/Unable to load/)).toBeNull();
    expect(hlsMock.instances).toHaveLength(2);
    expect(hls().src).toContain('route-b');
    expect(hls().config.startPosition).toBe(0);
    expect(offset(store)).toBe(0);

    dispatch(pause());
    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' });
    fireEvent.click(screen.getByText('Retry'));
    expect(hlsMock.instances).toHaveLength(3);
    expect(hls().src).toContain('route-b');
    expect(m.paused).toBe(true);
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('shows paused, not playing without a source, when a source cannot be played at all', async () => {
    const unsupported = Object.assign(() => { hlsMock.supported = false; }, { native: true });
    const { store, m } = await setup({}, { prepare: unsupported });
    await screen.findByText('Unable to load video');
    expect(store.getState().desiredPlaySpeed).toBe(0);
    act(() => { playVideo(1); store.dispatch(play(1)); });
    expect(screen.getByText('Unable to load video')).toBeInTheDocument();
    expect(store.getState().desiredPlaySpeed).toBe(0);
    expect(m.plays).toBe(0);
  });

  it('reports a missing upload only when hls.js saw a 404', async () => {
    const { hls } = await setup();
    hls().emit('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 404 } });
    expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
    expect(hlsMock.instances).toHaveLength(1);
  });

  describe('when a listed fragment is missing', () => {
    // A non-fatal fragment 404 as hls.js reports it before re-requesting the same fragment.
    const fragError = (url, extra) => ({
      fatal: false, type: 'networkError', details: 'fragLoadError', frag: { url }, ...extra,
    });
    const missingFrag = (url) => fragError(url, { response: { code: 404, url } });

    it('reports it as missing on its second 404 instead of waiting out hls.js retries, and Retry resumes', async () => {
      const { store, m, ready, progress, dispatch, hls } = await setup();
      ready();
      dispatch(play(2));
      progress(42);
      const old = hls();
      old.emit('hlsError', missingFrag('seg/5.ts'));
      old.emit('hlsFragLoaded', { frag: { url: 'seg/5.ts' } });
      // A later fetch of a successfully loaded fragment gets a fresh grace retry.
      old.emit('hlsError', missingFrag('seg/5.ts'));
      // A different fragment that misses once is a separate transient miss, not a repeat.
      old.emit('hlsError', missingFrag('seg/6.ts'));
      expect(screen.queryByText(/not uploaded/)).toBeNull();
      expect(old.destroyed).toBe(false);
      expect(m.paused).toBe(false);

      old.emit('hlsError', missingFrag('seg/6.ts'));
      expect(screen.getByText('This video segment has not uploaded yet or has been deleted.')).toBeInTheDocument();
      expect(old.destroyed).toBe(true);
      expect(spinner()).toBeNull();
      expect(m.paused).toBe(true);
      expect(store.getState()).toMatchObject({ offset: 42000, desiredPlaySpeed: 0 });

      act(() => {
        screen.getByText('Retry').click();
        expect(m.paused).toBe(false); // inside the click, before React re-renders
        expect(m.playbackRate).toBe(2);
      });
      expect(hlsMock.instances).toHaveLength(2);
      expect(hls().config.startPosition).toBe(42);
      expect(store.getState().desiredPlaySpeed).toBe(2);
      // The reloaded source gets its own grace retry for the same fragment.
      hls().emit('hlsError', missingFrag('seg/6.ts'));
      expect(screen.queryByText(/not uploaded/)).toBeNull();
      expect(hls().destroyed).toBe(false);
    });

    it('leaves retryable fragment errors and non-fatal media errors to hls.js', async () => {
      const { store, m, ready, dispatch, hls } = await setup();
      ready();
      dispatch(play(2));
      for (let i = 0; i < 3; i += 1) {
        hls().emit('hlsError', fragError('seg/5.ts', { response: { code: 503, url: 'seg/5.ts' } }));
        hls().emit('hlsError', fragError('seg/5.ts', { details: 'fragLoadTimeout' }));
        hls().emit('hlsError', { fatal: false, type: 'mediaError', details: 'bufferStalledError' });
        // Only fragments are handled early; a missing playlist stays with hls.js until it is fatal.
        hls().emit('hlsError', { fatal: false, type: 'networkError', details: 'levelLoadError', response: { code: 404 } });
      }
      expect(screen.queryByText('Retry')).toBeNull();
      expect(hls().destroyed).toBe(false);
      expect(hls().recoverMediaError).not.toHaveBeenCalled();
      expect(hlsMock.instances).toHaveLength(1);
      expect(m.paused).toBe(false);
      expect(store.getState().desiredPlaySpeed).toBe(2);
    });

    it('ignores the previous route\'s fragment 404s once another route is loading', async () => {
      const { store, dispatch, hls } = await setup();
      const old = hls();
      old.emit('hlsError', missingFrag('seg/0.ts'));
      dispatch({ type: 'PATCH', patch: { currentRoute: routeB } });
      dispatch(resetPlayback());
      const current = hls();
      expect(current).not.toBe(old);

      old.emit('hlsError', missingFrag('seg/0.ts'));
      old.emit('hlsError', missingFrag('seg/0.ts'));
      expect(screen.queryByText(/not uploaded/)).toBeNull();
      expect(current.destroyed).toBe(false);
      expect(store.getState().desiredPlaySpeed).toBe(1);
    });
  });

  it('isolates the next route from the previous source events and promises', async () => {
    const rejects = [];
    const { store, m, fire, dispatch, ready, hls, onAudio } = await setup({}, {
      prepare: (state) => { state.playResult = pendingPlay(rejects); },
    });
    await waitFor(() => expect(hlsMock.instances.length).toBe(1));
    const old = hls();
    old.emit('hlsBufferCodecs', { audio: {}, video: {} });
    expect(onAudio).toHaveBeenLastCalledWith(true);

    m.playResult = null;
    dispatch({ type: 'PATCH', patch: { currentRoute: routeB } });
    dispatch(resetPlayback());
    expect(old.destroyed).toBe(true);
    expect(onAudio).toHaveBeenLastCalledWith(false);
    expect(hls().src).toContain('route-b');

    old.emit('hlsBufferCodecs', { audio: {}, video: {} });
    old.emit('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 404 } });
    // A pause queued by the old source, arriving before the new source has metadata.
    m.paused = true;
    fire('pause');
    await act(async () => rejects[0](abortError()));
    expect(onAudio).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText(/not uploaded/)).toBeNull();
    expect(store.getState().desiredPlaySpeed).toBe(1);

    hls().emit('hlsBufferCodecs', { video: {} });
    ready();
    m.currentTime = 0;
    expect(offset(store)).toBe(0);
  });

  it('reloads a refreshed share URL at the current position', async () => {
    const { m, dispatch, ready, seeked, progress, hls } = await setup();
    ready();
    seeked();
    progress(25);
    const old = hls();
    dispatch({ type: 'PATCH', patch: { currentRoute: { ...route, share_sig: 'b' } } });
    expect(old.destroyed).toBe(true);
    expect(hls().src).toContain('sig=b');
    expect(hls().config.startPosition).toBe(25);
    expect(m.seeks).toEqual([]);
  });

  describe('native HLS on iPadOS', () => {
    const descriptors = {};
    beforeEach(() => {
      for (const key of ['userAgent', 'maxTouchPoints']) descriptors[key] = Object.getOwnPropertyDescriptor(Navigator.prototype, key);
      Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { configurable: true, get: () => 5 });
    });
    afterEach(() => {
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(Navigator.prototype, key, descriptor);
        else delete Navigator.prototype[key];
      }
    });

    const prepare = Object.assign((m) => { m.nativeHls = true; }, { native: true });

    it('plays the playlist natively, detects audio tracks, and stops auto-retrying unsupported sources', async () => {
      const { video, m, fire, ready, onAudio } = await setup({}, { prepare });
      expect(hlsMock.instances).toHaveLength(0);
      expect(video.getAttribute('src')).toContain('route-a/qcamera.m3u8');
      m.audioTracks = { length: 1 };
      ready();
      expect(onAudio).toHaveBeenLastCalledWith(true);

      expect(m.paused).toBe(false);
      video.setAttribute('src', 'stale');
      m.error = { code: 4 };
      fire('error');
      expect(screen.getByText('Unable to load video')).toBeInTheDocument();
      expect(video.getAttribute('src')).toBe('stale');
      expect(m.paused).toBe(true);

      m.error = null;
      act(() => {
        screen.getByText('Retry').click();
        expect(m.paused).toBe(false); // inside the click, before React re-renders
      });
      expect(video.getAttribute('src')).toContain('route-a/qcamera.m3u8');
    });

    it('detects an audio track that native HLS lists only after metadata, and stops listening on unmount', async () => {
      const tracks = Object.assign(new EventTarget(), { length: 0 });
      const prepareTracks = Object.assign((m) => { m.nativeHls = true; m.audioTracks = tracks; }, { native: true });
      const { m, fire, onAudio, unmount } = await setup({}, { prepare: prepareTracks });
      const trackEvent = (type, length) => act(() => { tracks.length = length; tracks.dispatchEvent(new Event(type)); });
      m.readyState = 1;
      fire('loadedmetadata');
      expect(onAudio).not.toHaveBeenCalled();
      tracks.length = 1;
      m.readyState = 4;
      fire('canplay');
      expect(onAudio).toHaveBeenLastCalledWith(true);
      trackEvent('removetrack', 0);
      expect(onAudio).toHaveBeenLastCalledWith(false);
      trackEvent('addtrack', 1);
      expect(onAudio).toHaveBeenLastCalledWith(true);

      unmount();
      onAudio.mockClear();
      trackEvent('removetrack', 0);
      expect(onAudio).not.toHaveBeenCalled();
    });

    it('offers Retry as soon as native playback reports a network error', async () => {
      const { video, m, fire } = await setup({}, { prepare });
      video.setAttribute('src', 'stale');
      m.error = { code: 2 };
      fire('error');
      expect(screen.getByText('Unable to load video. Check network connection.')).toBeInTheDocument();
      expect(video.getAttribute('src')).toBe('stale');
    });

    it('pauses on a native network error, and Play reloads in place inside the gesture', async () => {
      const { store, video, m, fire, dispatch, ready, seeked, progress } = await setup({}, { prepare });
      ready();
      dispatch(play(2));
      progress(42);
      video.setAttribute('src', 'stale');
      m.error = { code: 2 };
      fire('error');
      expect(m.paused).toBe(true);
      expect(store.getState().desiredPlaySpeed).toBe(0);
      expect(offset(store)).toBe(42000);
      expect(spinner()).toBeNull();

      const { plays } = m;
      act(() => {
        playVideo(2);
        // Asserted before the store hears of the play, so the request is part of the gesture.
        expect(video.getAttribute('src')).toContain('route-a/qcamera.m3u8');
        expect(m.plays).toBe(plays + 1);
        expect(m.paused).toBe(false);
        expect(m.playbackRate).toBe(2);
        store.dispatch(play(2));
      });
      expect(screen.queryByText(/Unable to load/)).toBeNull();
      // The fake element keeps its old state across a source change, which a browser resets.
      Object.assign(m, { error: null, readyState: 0, currentTime: 0 });
      ready();
      expect(m.seeks.at(-1)).toBe(42);
      seeked();
      expect(store.getState()).toMatchObject({ offset: 42000, desiredPlaySpeed: 2 });
      expect(m.plays).toBe(plays + 1);
      expect(hlsMock.instances).toHaveLength(0);
    });
  });

  it('freezes the clock at the last observed position once the video unmounts', async () => {
    const { store, ready, seeked, progress, unmount } = await setup();
    ready();
    seeked();
    progress(7);
    unmount();
    expect(offset(store)).toBe(7000);
  });
});
