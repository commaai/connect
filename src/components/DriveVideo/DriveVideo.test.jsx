import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Hls from 'hls.js';
import { api } from '../../api/backend';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, play, reducer, releaseVideo, videoTime } from '../../timeline/playback';
import { DriveVideo } from '.';

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: vi.fn() } },
}));
vi.mock('../../store', () => ({ default: { getState: vi.fn() } }));
vi.mock('hls.js', () => {
  class MockHls {
    static instances = [];
    static isSupported = vi.fn(() => true);
    static Events = {
      MEDIA_ATTACHED: 'hlsMediaAttached',
      MEDIA_DETACHING: 'hlsMediaDetaching',
      MANIFEST_PARSED: 'hlsManifestParsed',
      BUFFER_CODECS: 'hlsBufferCodecs',
      ERROR: 'hlsError',
    };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static ErrorDetails = { BUFFER_STALLED_ERROR: 'bufferStalledError' };

    constructor() {
      this.listeners = new Map();
      this.on = vi.fn((event, callback) => {
        const listeners = this.listeners.get(event) || new Set();
        listeners.add(callback);
        this.listeners.set(event, listeners);
      });
      this.off = vi.fn((event, callback) => this.listeners.get(event)?.delete(callback));
      this.attachMedia = vi.fn((media) => { this.media = media; });
      this.loadSource = vi.fn();
      this.startLoad = vi.fn();
      this.stopLoad = vi.fn();
      this.recoverMediaError = vi.fn();
      this.destroy = vi.fn(() => this.listeners.clear());
      MockHls.instances.push(this);
    }

    emit(event, data = {}) {
      this.listeners.get(event)?.forEach((callback) => callback(event, data));
    }
  }
  return { default: MockHls };
});

const route = {
  fullname: 'test-device|2026-10-07--12-00-00',
  share_exp: '1000',
  share_sig: 'first-signature',
  videoStartOffset: 2000,
};

let mediaStates;
let originalDescriptors;
let playMock;
let pauseMock;

function mediaState(video) {
  if (!mediaStates.has(video)) {
    mediaStates.set(video, {
      currentTime: 0,
      duration: NaN,
      readyState: 0,
      paused: true,
      ended: false,
      audioTracks: [],
      buffered: { length: 1, start: () => 0, end: () => 60 },
      error: null,
      seeks: [],
    });
  }
  return mediaStates.get(video);
}

function mount(overrides = {}) {
  let props = {
    dispatch: vi.fn(),
    currentRoute: route,
    desiredPlaySpeed: 1,
    offset: 7000,
    seekRevision: 0,
    loop: null,
    isMuted: true,
    onAudioStatusChange: vi.fn(),
    ...overrides,
  };
  const view = render(<DriveVideo {...props} />);
  return {
    ...view,
    props,
    update(changes) {
      props = { ...props, ...changes };
      view.rerender(<DriveVideo {...props} />);
    },
  };
}

function loadMetadata(video, changes = {}) {
  Object.assign(mediaState(video), { readyState: 4, duration: 60, ...changes });
  fireEvent.loadedMetadata(video);
  fireEvent.canPlay(video);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('late camera metadata', () => {
  it.each([0, 1])('preserves route position when camera offset arrives at speed %s', (desiredPlaySpeed) => {
    const view = mount({ currentRoute: { ...route, videoStartOffset: 0 }, offset: 10000, desiredPlaySpeed });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    expect(video.currentTime).toBe(10);
    view.props.dispatch.mockClear();
    view.update({ currentRoute: { ...route, videoStartOffset: 2000 } });
    expect(video.currentTime).toBe(8);
    expect(view.props.dispatch).toHaveBeenCalledWith(videoTime(10000));
    expect(Hls.instances).toHaveLength(1);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mediaStates = new WeakMap();
  Hls.instances.length = 0;
  Hls.isSupported.mockReturnValue(true);
  api.video.getQcameraStreamUrl.mockImplementation((fullname, expiry, signature) => (
    `https://video.example/${fullname}/qcamera.m3u8?exp=${expiry}&sig=${signature}`
  ));
  playMock = vi.fn(function playMedia() {
    mediaState(this).paused = false;
    return Promise.resolve();
  });
  pauseMock = vi.fn(function pauseMedia() { mediaState(this).paused = true; });
  const descriptors = {
    play: { value: playMock, writable: true },
    pause: { value: pauseMock, writable: true },
    load: { value: vi.fn(), writable: true },
    canPlayType: { value: vi.fn(() => ''), writable: true },
  };
  for (const property of ['duration', 'readyState', 'paused', 'ended', 'audioTracks', 'buffered', 'error']) {
    descriptors[property] = { get() { return mediaState(this)[property]; } };
  }
  descriptors.currentTime = {
    get() { return mediaState(this).currentTime; },
    set(value) {
      mediaState(this).currentTime = value;
      mediaState(this).seeks.push(value);
    },
  };
  originalDescriptors = new Map();
  for (const [property, descriptor] of Object.entries(descriptors)) {
    originalDescriptors.set(property, Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, property));
    Object.defineProperty(HTMLMediaElement.prototype, property, { configurable: true, ...descriptor });
  }
});

afterEach(() => {
  cleanup();
  for (const [property, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(HTMLMediaElement.prototype, property, descriptor);
    else delete HTMLMediaElement.prototype[property];
  }
  vi.restoreAllMocks();
});

describe('DriveVideo native media clock', () => {
  it('respects a native user pause while a seek is still pending', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    Object.defineProperty(video, 'seeking', { configurable: true, writable: true, value: true });
    fireEvent.seeking(video);
    mediaState(video).paused = true;
    view.props.dispatch.mockClear();
    fireEvent.pause(video);
    expect(view.props.dispatch).toHaveBeenCalledWith(pause());
    view.update({ desiredPlaySpeed: 0 });
    playMock.mockClear();
    video.seeking = false;
    fireEvent.seeked(video);
    expect(video.paused).toBe(true);
    expect(playMock).not.toHaveBeenCalled();
  });

  it('does not recover further HLS errors after a terminal failure until Retry', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const hls = Hls.instances[0];
    act(() => {
      hls.emit(Hls.Events.ERROR, { fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR });
      view.props.dispatch.mockClear();
      Object.assign(mediaState(video), { paused: false, currentTime: 12 });
      fireEvent.playing(video);
      fireEvent.timeUpdate(video);
      fireEvent.canPlay(video);
      hls.emit(Hls.Events.ERROR, { fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR });
    });
    expect(view.props.dispatch).not.toHaveBeenCalled();
    expect(hls.recoverMediaError).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    const replacement = Hls.instances[1];
    act(() => replacement.emit(Hls.Events.ERROR, { fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR }));
    expect(replacement.recoverMediaError).toHaveBeenCalledTimes(1);
  });

  it('renders inline muted video and attaches the credentialed HLS source', () => {
    mount();
    const video = screen.getByLabelText('Drive video');
    expect(video.tagName).toBe('VIDEO');
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.muted).toBe(true);
    expect(api.video.getQcameraStreamUrl).toHaveBeenCalledWith(route.fullname, route.share_exp, route.share_sig);
    expect(Hls.instances).toHaveLength(1);
    expect(Hls.instances[0].attachMedia).toHaveBeenCalledWith(video);
    act(() => Hls.instances[0].emit(Hls.Events.MEDIA_ATTACHED));
    expect(Hls.instances[0].loadSource).toHaveBeenCalledWith(expect.stringContaining('sig=first-signature'));
  });

  it('waits for finite duration metadata before applying the initial route-relative seek', () => {
    mount();
    const video = screen.getByLabelText('Drive video');
    const state = mediaState(video);
    expect(state.seeks).toEqual([]);
    fireEvent.loadedMetadata(video);
    expect(state.seeks).toEqual([]);
    loadMetadata(video);
    expect(video.currentTime).toBe(5);
  });

  it.each([[1000, 0], [70000, 60]])('clamps initial route offset %i to media time %i', (offset, expectedTime) => {
    mount({ offset });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    expect(video.currentTime).toBe(expectedTime);
  });

  it('seeks on explicit revisions, including repeated commands with the same offset', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    state.seeks.length = 0;
    view.update({ offset: 12000, seekRevision: 1 });
    expect(video.currentTime).toBe(10);
    state.currentTime = 11;
    view.update({ seekRevision: 2 });
    expect(video.currentTime).toBe(10);
    expect(state.seeks).toEqual([10, 10]);
  });

  it('publishes native time progress without seeking on Redux offset updates', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    state.seeks.length = 0;
    view.props.dispatch.mockClear();
    state.currentTime = 9.25;
    fireEvent.timeUpdate(video);
    expect(view.props.dispatch).toHaveBeenCalledWith(videoTime(11250));
    view.update({ offset: 11250 });
    view.update({ offset: 24000 });
    expect(state.seeks).toEqual([]);
    expect(video.currentTime).toBe(9.25);
  });

  it('freezes buffering on waiting and resumes only when native playback resumes', () => {
    let now = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let playbackState = {
      offset: 7000, desiredPlaySpeed: 2, startTime: now,
      isBufferingVideo: false, isMediaClock: false, seekRevision: 0, loop: null,
    };
    const dispatch = vi.fn((action) => { playbackState = reducer(playbackState, action); });
    const view = mount({ desiredPlaySpeed: 2, dispatch });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    view.props.dispatch.mockClear();
    mediaState(video).currentTime = 8;
    fireEvent.waiting(video);
    expect(view.props.dispatch).toHaveBeenCalledWith(bufferVideo(true));
    expect(view.props.dispatch).not.toHaveBeenCalledWith(pause());
    expect(currentOffset(playbackState)).toBe(10000);
    now += 5000;
    expect(currentOffset(playbackState)).toBe(10000);
    view.props.dispatch.mockClear();
    fireEvent.playing(video);
    expect(view.props.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(video.playbackRate).toBe(2);
    expect(playbackState.desiredPlaySpeed).toBe(2);
    mediaState(video).currentTime = 9;
    fireEvent.timeUpdate(video);
    expect(currentOffset(playbackState)).toBe(11000);
  });

  it('publishes the final native position and pause intent on a user pause', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    fireEvent.playing(video);
    view.props.dispatch.mockClear();
    Object.assign(mediaState(video), { currentTime: 8, paused: true });
    fireEvent.pause(video);
    expect(view.props.dispatch).toHaveBeenCalledWith(videoTime(10000));
    expect(view.props.dispatch).toHaveBeenCalledWith(pause());
  });

  it('physically rewinds a zero-based loop rather than only wrapping Redux time', () => {
    const view = mount({ currentRoute: { ...route, videoStartOffset: 0 }, offset: 0,
      loop: { startTime: 0, duration: 3000 } });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    mediaState(video).seeks.length = 0;
    mediaState(video).currentTime = 3.1;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(0);
    expect(mediaState(video).seeks).toContain(0);
    expect(view.props.dispatch).toHaveBeenCalledWith(videoTime(0));
  });

  it('clamps a new loop to route-relative media time without a seek revision', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    view.update({ loop: { startTime: 12000, duration: 3000 } });
    expect(video.currentTime).toBe(10);
  });

  it('does not create an undefined source when there is no route', () => {
    const view = mount({ currentRoute: null });
    expect(api.video.getQcameraStreamUrl).not.toHaveBeenCalled();
    expect(Hls.instances).toHaveLength(0);
    for (const video of view.container.querySelectorAll('video')) {
      expect(video.getAttribute('src') || '').not.toContain('undefined');
      expect(video.querySelector('source')).toBeNull();
    }
  });

  it.each(['share_exp', 'share_sig'])('recreates the source when %s changes on the same route', (credential) => {
    const view = mount();
    const firstHls = Hls.instances[0];
    const nextRoute = { ...route, [credential]: 'replacement-credential' };
    view.update({ currentRoute: nextRoute });
    expect(firstHls.destroy).toHaveBeenCalledTimes(1);
    expect(Hls.instances).toHaveLength(2);
    act(() => Hls.instances[1].emit(Hls.Events.MEDIA_ATTACHED));
    expect(api.video.getQcameraStreamUrl).toHaveBeenLastCalledWith(nextRoute.fullname, nextRoute.share_exp, nextRoute.share_sig);
    expect(Hls.instances[1].loadSource).toHaveBeenCalledWith(expect.stringContaining('replacement-credential'));
  });

  it('detects native audio tracks without HLS support', () => {
    Hls.isSupported.mockReturnValue(false);
    HTMLMediaElement.prototype.canPlayType.mockReturnValue('probably');
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video, { audioTracks: [{ enabled: true }] });
    expect(view.props.onAudioStatusChange).toHaveBeenCalledWith(true);
    expect(Hls.instances).toHaveLength(0);
    expect(video.getAttribute('src')).toContain('qcamera.m3u8');
  });

  it('detects HLS audio codecs and reports streams without audio', () => {
    const view = mount();
    const hls = Hls.instances[0];
    act(() => hls.emit(Hls.Events.BUFFER_CODECS, { audio: { codec: 'mp4a.40.2' } }));
    expect(view.props.onAudioStatusChange).toHaveBeenLastCalledWith(true);
    act(() => hls.emit(Hls.Events.BUFFER_CODECS, { video: { codec: 'avc1' } }));
    expect(view.props.onAudioStatusChange).toHaveBeenLastCalledWith(false);
  });

  it('offers an accessible Play video CTA after autoplay rejection without unmuting', async () => {
    playMock.mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError'));
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const button = await screen.findByRole('button', { name: 'Play video' });
    expect(video.muted).toBe(true);
    fireEvent.click(button);
    await waitFor(() => expect(playMock.mock.calls.length).toBeGreaterThan(1));
    expect(video.muted).toBe(true);
    expect(view.props.dispatch).toHaveBeenCalledWith(play(1));
  });

  it('ignores AbortError playback rejection without showing an error or autoplay CTA', async () => {
    playMock.mockRejectedValue(new DOMException('Superseded play', 'AbortError'));
    mount();
    loadMetadata(screen.getByLabelText('Drive video'));
    await act(async () => { await Promise.resolve(); });
    expect(playMock).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
  });

  it('shows fatal HLS network errors with an actionable source retry', async () => {
    mount();
    const firstHls = Hls.instances[0];
    act(() => firstHls.emit(Hls.Events.ERROR, {
      fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR, details: 'manifestLoadError', response: { code: 503 },
    }));
    expect(screen.getByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(Hls.instances).toHaveLength(2));
    expect(firstHls.destroy).toHaveBeenCalledTimes(1);
    act(() => Hls.instances[1].emit(Hls.Events.MEDIA_ATTACHED));
    expect(Hls.instances[1].loadSource).toHaveBeenCalled();
  });

  it('shows native network errors with a retry instead of silently freezing', () => {
    Hls.isSupported.mockReturnValue(false);
    HTMLMediaElement.prototype.canPlayType.mockReturnValue('probably');
    mount();
    const video = screen.getByLabelText('Drive video');
    mediaState(video).error = { code: 2 };
    fireEvent.error(video);
    expect(screen.getByRole('alert')).toBeVisible();
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry).toBeEnabled();
    const loadCount = HTMLMediaElement.prototype.load.mock.calls.length;
    fireEvent.click(retry);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loadCount + 1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recovers one fatal HLS media failure before exposing repeated failure for retry', () => {
    mount();
    const hls = Hls.instances[0];
    const failure = { fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR, details: 'bufferAppendError' };
    act(() => hls.emit(Hls.Events.ERROR, failure));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    act(() => hls.emit(Hls.Events.ERROR, failure));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
  });

  it('ignores autoplay rejection belonging to a replaced source', async () => {
    const pending = deferred();
    playMock.mockReturnValueOnce(pending.promise);
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    expect(playMock).toHaveBeenCalled();
    view.update({ currentRoute: { ...route, share_sig: 'new-source' } });
    await act(async () => {
      pending.reject(new DOMException('Old source blocked', 'NotAllowedError'));
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'])('destroys HLS and ignores late play promise %s after unmount', async (settlement) => {
    const pending = deferred();
    playMock.mockReturnValue(pending.promise);
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    expect(playMock).toHaveBeenCalled();
    const hls = Hls.instances[0];
    view.unmount();
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(view.props.dispatch).toHaveBeenCalledWith(releaseVideo());
    view.props.dispatch.mockClear();
    view.props.onAudioStatusChange.mockClear();
    await act(async () => {
      if (settlement === 'resolve') pending.resolve();
      else pending.reject(new DOMException('Late autoplay failure', 'NotAllowedError'));
      await Promise.resolve();
      hls.emit(Hls.Events.BUFFER_CODECS, { audio: {} });
      fireEvent.timeUpdate(video);
      fireEvent.playing(video);
    });
    expect(view.props.dispatch).not.toHaveBeenCalled();
    expect(view.props.onAudioStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
  });

  it('releases the media clock when switching to a map-only route', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    fireEvent.timeUpdate(video);
    view.props.dispatch.mockClear();
    const hls = Hls.instances[0];
    view.update({ currentRoute: null });
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(view.props.dispatch).toHaveBeenCalledWith(releaseVideo());
    view.props.dispatch.mockClear();
    fireEvent.timeUpdate(video);
    expect(view.props.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: videoTime(0).type }));
    expect(Hls.instances).toHaveLength(1);
  });

  it('propagates native mute changes without feeding back a matching mute prop', () => {
    const onMuteChange = vi.fn();
    const view = mount({ onMuteChange });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    Object.defineProperty(video, 'muted', { configurable: true, writable: true, value: true });
    fireEvent.volumeChange(video);
    expect(onMuteChange).not.toHaveBeenCalled();

    video.muted = false;
    fireEvent.volumeChange(video);
    expect(onMuteChange).toHaveBeenCalledExactlyOnceWith(false);
    view.update({ isMuted: false });
    fireEvent.volumeChange(video);
    expect(onMuteChange).toHaveBeenCalledTimes(1);

    video.muted = true;
    fireEvent.volumeChange(video);
    expect(onMuteChange).toHaveBeenLastCalledWith(true);
    expect(onMuteChange).toHaveBeenCalledTimes(2);
    view.update({ isMuted: true });
    fireEvent.volumeChange(video);
    expect(onMuteChange).toHaveBeenCalledTimes(2);
  });

  it.each([0.5, 2])('dispatches native playback rate %s without feeding back a matching speed prop', (rate) => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    Object.defineProperty(video, 'playbackRate', { configurable: true, writable: true, value: 1 });
    view.props.dispatch.mockClear();
    video.playbackRate = rate;
    fireEvent.rateChange(video);
    expect(view.props.dispatch.mock.calls).toEqual([[play(rate)]]);
    view.update({ desiredPlaySpeed: rate });
    view.props.dispatch.mockClear();
    fireEvent.rateChange(video);
    expect(view.props.dispatch).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(rate);
  });

  it('uses Hls.js when Chromium advertises maybe native HLS support', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    );
    HTMLMediaElement.prototype.canPlayType.mockReturnValue('maybe');
    mount();
    const video = screen.getByLabelText('Drive video');
    expect(Hls.isSupported()).toBe(true);
    expect(Hls.instances).toHaveLength(1);
    expect(Hls.instances[0].attachMedia).toHaveBeenCalledExactlyOnceWith(video);
    expect(Hls.instances[0].loadSource).toHaveBeenCalledWith(expect.stringContaining('qcamera.m3u8'));
    expect(video.getAttribute('src')).toBeNull();
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it.each([
    ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['iPad Safari', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['desktop-mode iPad Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'],
    ['Edge iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/140.0.0 Mobile/15E148 Safari/605.1.15'],
  ])('prefers native HLS on %s even when Hls.js is supported', (browser, userAgent) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    HTMLMediaElement.prototype.canPlayType.mockReturnValue('probably');
    mount();
    const video = screen.getByLabelText('Drive video');
    expect(Hls.isSupported()).toBe(true);
    expect(Hls.instances).toHaveLength(0);
    expect(video.getAttribute('src')).toContain('qcamera.m3u8');
    expect(video.getAttribute('src')).toContain('sig=first-signature');
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['before', { startTime: -6000, duration: 3000 }],
    ['after', { startTime: 65000, duration: 3000 }],
    ['at the end of', { startTime: 62000, duration: 3000 }],
  ])('does not seek out of bounds or loop the whole video for a selection %s available media', (position, loop) => {
    const view = mount({ desiredPlaySpeed: 0 });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    state.seeks.length = 0;
    view.update({ loop });
    expect(video.currentTime).toBe(5);
    expect(state.seeks).toEqual([]);

    state.currentTime = 60;
    view.props.dispatch.mockClear();
    fireEvent.timeUpdate(video);
    expect(view.props.dispatch.mock.calls).toEqual([[videoTime(62000)]]);
    expect(video.currentTime).toBe(60);
    expect(state.seeks).toEqual([]);

    state.ended = true;
    fireEvent.ended(video);
    expect(view.props.dispatch).toHaveBeenCalledWith(pause());
    expect(video.currentTime).toBe(60);
    expect(state.seeks).toEqual([]);
    expect(playMock).not.toHaveBeenCalled();
  });

  it('falls back to rate 1 and dispatches play 1 when the browser rejects a requested rate', () => {
    const view = mount({ desiredPlaySpeed: 0 });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    let playbackRate = 0.5;
    const setPlaybackRate = vi.fn((rate) => {
      if (rate !== 1) throw new DOMException('Unsupported playback rate', 'NotSupportedError');
      playbackRate = rate;
    });
    Object.defineProperty(video, 'playbackRate', {
      configurable: true,
      get: () => playbackRate,
      set: setPlaybackRate,
    });
    view.props.dispatch.mockClear();
    view.update({ desiredPlaySpeed: 16 });
    expect(setPlaybackRate.mock.calls).toEqual([[16], [1]]);
    expect(video.playbackRate).toBe(1);
    expect(view.props.dispatch.mock.calls).toEqual([[play(1)]]);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('retains the native position clock on paused time updates without autoplay', () => {
    let now = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let playbackState = {
      offset: 7000, desiredPlaySpeed: 0, startTime: now,
      isBufferingVideo: false, isMediaClock: false, seekRevision: 0, loop: null,
    };
    const dispatch = vi.fn((action) => { playbackState = reducer(playbackState, action); });
    const view = mount({ desiredPlaySpeed: 0, dispatch });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    state.seeks.length = 0;
    dispatch.mockClear();
    state.currentTime = 9.25;
    fireEvent.timeUpdate(video);
    expect(dispatch.mock.calls).toEqual([[videoTime(11250)]]);
    expect(playbackState.isMediaClock).toBe(true);
    expect(playbackState.desiredPlaySpeed).toBe(0);
    now += 5000;
    expect(currentOffset(playbackState)).toBe(11250);
    view.update({ offset: 11250 });
    fireEvent.canPlay(video);
    expect(video.currentTime).toBe(9.25);
    expect(state.seeks).toEqual([]);
    expect(video.paused).toBe(true);
    expect(playMock).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: play(1).type }));
  });

  it('resumes while an earlier play promise is pending and ignores its late rejection', async () => {
    const firstPlay = deferred();
    const resumedPlay = deferred();
    playMock.mockReturnValueOnce(firstPlay.promise).mockReturnValueOnce(resumedPlay.promise);
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    expect(playMock).toHaveBeenCalledTimes(1);
    view.update({ desiredPlaySpeed: 0 });
    expect(video.paused).toBe(true);
    view.update({ desiredPlaySpeed: 1 });
    expect(playMock).toHaveBeenCalledTimes(2);
    view.props.dispatch.mockClear();

    await act(async () => {
      firstPlay.reject(new DOMException('Superseded autoplay', 'NotAllowedError'));
      await Promise.resolve();
    });
    expect(view.props.dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.canPlay(video);
    expect(playMock).toHaveBeenCalledTimes(2);

    await act(async () => { resumedPlay.resolve(); });
    mediaState(video).paused = false;
    fireEvent.playing(video);
    expect(video.paused).toBe(false);
    expect(view.props.dispatch).toHaveBeenCalledWith(bufferVideo(false));
    expect(view.props.dispatch).not.toHaveBeenCalledWith(pause());
  });

  it('preserves desired speed and saved position across an HLS recovery reload pause', () => {
    let playbackState = {
      offset: 7000, desiredPlaySpeed: 2, startTime: 10000,
      isBufferingVideo: false, isMediaClock: false, seekRevision: 0, loop: null,
    };
    const dispatch = vi.fn((action) => { playbackState = reducer(playbackState, action); });
    mount({ desiredPlaySpeed: 2, dispatch });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    const hls = Hls.instances[0];
    state.currentTime = 9;
    fireEvent.timeUpdate(video);
    expect(currentOffset(playbackState)).toBe(11000);
    hls.recoverMediaError.mockImplementation(() => {
      Object.assign(state, { readyState: 0, paused: true, currentTime: 0 });
      hls.emit(Hls.Events.MEDIA_DETACHING);
      fireEvent.pause(video);
    });
    dispatch.mockClear();
    act(() => hls.emit(Hls.Events.ERROR, {
      fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR, details: 'bufferAppendError',
    }));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith(pause());
    expect(playbackState.desiredPlaySpeed).toBe(2);
    expect(currentOffset(playbackState)).toBe(11000);

    state.readyState = 4;
    dispatch.mockClear();
    fireEvent.timeUpdate(video);
    expect(dispatch).not.toHaveBeenCalled();
    state.seeks.length = 0;
    loadMetadata(video);
    expect(state.seeks).toEqual([9]);
    expect(video.currentTime).toBe(9);
    expect(video.playbackRate).toBe(2);
    expect(video.paused).toBe(false);
    expect(currentOffset(playbackState)).toBe(11000);
    expect(playbackState.desiredPlaySpeed).toBe(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows HLS media recovery after a native error without latching a terminal error', () => {
    mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    mediaState(video).error = { code: 3 };
    fireEvent.error(video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const hls = Hls.instances[0];
    act(() => hls.emit(Hls.Events.ERROR, {
      fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR, details: 'bufferAppendError',
    }));
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    mediaState(video).error = null;
    loadMetadata(video);
    fireEvent.playing(video);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(video.paused).toBe(false);
  });

  it('ignores a stale pause event after native playback has resumed', () => {
    const view = mount();
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    fireEvent.playing(video);
    expect(video.paused).toBe(false);
    view.props.dispatch.mockClear();
    fireEvent.pause(video);
    expect(view.props.dispatch).not.toHaveBeenCalled();
    expect(video.paused).toBe(false);
  });

  it('ignores a stale playing event while the media is paused', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(101);
    const view = mount({ desiredPlaySpeed: 0 });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    expect(video.paused).toBe(true);
    view.props.dispatch.mockClear();
    requestFrame.mockClear();
    fireEvent.playing(video);
    expect(view.props.dispatch).not.toHaveBeenCalled();
    expect(playMock).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('does not autoplay a selected loop when its ended event arrives after a user pause', () => {
    const view = mount({ loop: { startTime: 2000, duration: 3000 } });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    view.update({ desiredPlaySpeed: 0 });
    fireEvent.pause(video);
    playMock.mockClear();
    state.currentTime = 3;
    state.ended = true;
    fireEvent.ended(video);
    expect(video.paused).toBe(true);
    expect(playMock).not.toHaveBeenCalled();
    expect(view.props.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: play(1).type }));
  });

  it('pauses on fatal HLS failure and ignores later playing and time updates', () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(101);
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    let playbackState = {
      offset: 7000, desiredPlaySpeed: 1, startTime: 10000,
      isBufferingVideo: false, isMediaClock: false, seekRevision: 0, loop: null,
    };
    const dispatch = vi.fn((action) => { playbackState = reducer(playbackState, action); });
    mount({ dispatch });
    const video = screen.getByLabelText('Drive video');
    loadMetadata(video);
    const state = mediaState(video);
    state.currentTime = 9;
    fireEvent.timeUpdate(video);
    fireEvent.playing(video);
    expect(requestFrame).toHaveBeenCalled();
    pauseMock.mockClear();
    act(() => Hls.instances[0].emit(Hls.Events.ERROR, {
      fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR, details: 'manifestLoadError',
    }));
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(true);
    expect(cancelFrame).toHaveBeenCalledWith(101);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(currentOffset(playbackState)).toBe(11000);

    dispatch.mockClear();
    requestFrame.mockClear();
    playMock.mockClear();
    Object.assign(state, { paused: false, currentTime: 12 });
    fireEvent.playing(video);
    fireEvent.timeUpdate(video);
    expect(dispatch).not.toHaveBeenCalled();
    expect(currentOffset(playbackState)).toBe(11000);
    expect(playbackState.isBufferingVideo).toBe(true);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(playMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeVisible();
  });
});
