import React from 'react';
import { Provider } from 'react-redux';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';

import DriveVideo from '.';
import { createAppStore } from '../../store';
import * as Types from '../../actions/types';
import { currentOffset } from '../../timeline';
import { pause, play, resetPlayback, seek, selectLoop } from '../../timeline/playback';

const hls = vi.hoisted(() => ({ instances: [], load: null }));

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: () => 'https://example.test/qcamera.m3u8' } } }));
// a getter, so each test can make the download fail
vi.mock('hls.js/light', () => ({ get default() { return hls.load(); } }));

class FakeHls {
  static Events = { ERROR: 'hlsError', BUFFER_CODECS: 'hlsBufferCodecs' };

  constructor(config) {
    this.config = config;
    this.handlers = {};
    hls.instances.push(this);
  }

  on(event, handler) { this.handlers[event] = handler; }

  loadSource() {}

  attachMedia(media) { this.media = media; }

  stopLoad() { this.stopped = true; }

  // hls.js resets the element it detaches from, like the real destroy()
  destroy() { this.destroyedOnPage = this.media?.isConnected; }

  recoverMediaError() {}
}

function renderPlayer() {
  const store = createAppStore(createMemoryHistory());
  store.dispatch({
    type: Types.ACTION_ROUTES_METADATA,
    routes: [{ log_id: 'r', fullname: 'x|r', duration: 180000 }],
  });
  store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 180000 });
  render(<Provider store={store}><DriveVideo /></Provider>);
  return store;
}

describe('DriveVideo', () => {
  beforeEach(() => {
    hls.instances = [];
    hls.load = () => FakeHls;
    window.MediaSource = class {};
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
    delete HTMLMediaElement.prototype.requestVideoFrameCallback;
    vi.useRealTimers();
  });

  it('says the drive has no video when the playlist is missing, and retries on request', async () => {
    const store = renderPlayer();
    await screen.findByRole('status');
    await act(async () => {});
    const [player] = hls.instances;
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 404 } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Video for this drive has not uploaded yet or has been deleted.');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(hls.instances).toHaveLength(2);
    expect(store.getState().desiredPlaySpeed).toBeGreaterThan(0);
  });

  it('pauses on a video error, and Play loads the video again where it stopped', async () => {
    let now = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const store = renderPlayer();
    await act(async () => {});
    store.dispatch(seek(60000));
    act(() => hls.instances[0].handlers.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Check your network connection');
    // nothing plays, so the time stops where the video stopped
    expect(store.getState().desiredPlaySpeed).toEqual(0);
    now += 5000;
    expect(currentOffset()).toEqual(60000);

    await act(async () => store.dispatch(play(1)));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(hls.instances).toHaveLength(2);
    expect(hls.instances[1].config.startPosition).toEqual(60);
    vi.restoreAllMocks();
  });

  it('names a missing segment, ignores errors hls.js recovers from, and retries in another segment', async () => {
    const store = renderPlayer();
    await act(async () => {});
    const [player] = hls.instances;
    act(() => player.handlers.hlsError('hlsError', { fatal: false, type: 'mediaError', details: 'bufferStalledError' }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError', response: { code: 404 } }));
    expect(screen.getByRole('alert')).toHaveTextContent('This video segment has not uploaded yet or has been deleted.');

    await act(async () => store.dispatch(seek(30000)));
    expect(hls.instances).toHaveLength(1);
    await act(async () => store.dispatch(seek(130000)));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(hls.instances).toHaveLength(2);
  });

  it('shows a network error when the player code cannot download', async () => {
    hls.load = () => { throw new TypeError('Failed to fetch dynamically imported module'); };
    renderPlayer();
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your network connection');
  });

  it('caps the speed at 2x only when it plays HLS natively', async () => {
    window.MediaSource = undefined;
    const store = renderPlayer();
    store.dispatch(play(4));
    expect(store.getState().desiredPlaySpeed).toEqual(2);
    cleanup();

    window.MediaSource = class {};
    const hlsStore = renderPlayer();
    await act(async () => {});
    hlsStore.dispatch(play(8));
    expect(hlsStore.getState().desiredPlaySpeed).toEqual(8);
  });

  it('starts no player for a drive the user already left', async () => {
    renderPlayer();
    cleanup();
    await act(async () => {});
    expect(hls.instances).toHaveLength(0);
  });

  it('starts at the requested time however long the player code takes to load', async () => {
    let now = 1000000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    hls.load = () => { now += 450; return FakeHls; };
    const store = createAppStore(createMemoryHistory());
    store.dispatch({ type: Types.ACTION_ROUTES_METADATA, routes: [{ log_id: 'r', fullname: 'x|r', duration: 180000 }] });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 180000 });
    store.dispatch(seek(150000));
    store.dispatch(play(1));
    render(<Provider store={store}><DriveVideo /></Provider>);
    await act(async () => {});
    expect(hls.instances[0].config.startPosition).toEqual(150);
    vi.restoreAllMocks();
  });

  it('leaves the picture alone when the drive closes', async () => {
    const store = renderPlayer();
    await act(async () => {});
    const video = document.querySelector('video');
    const seeks = [];
    Object.defineProperty(video, 'currentTime', { get: () => 42, set: (t) => seeks.push(t) });
    // hls.js has attached its stream and the video has started
    video.setAttribute('src', 'blob:stream');
    fireEvent.loadedMetadata(video);
    seeks.length = 0;
    HTMLMediaElement.prototype.load.mockClear();
    await act(async () => {
      store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: null, start: null, end: null });
      store.dispatch(resetPlayback());
      store.dispatch(selectLoop(null, null));
    });
    expect(seeks).toEqual([]);
    expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
  });

  it('gives the next drive a new player that starts at its own start, and never resets the old one on the page', async () => {
    const store = createAppStore(createMemoryHistory());
    store.dispatch({
      type: Types.ACTION_ROUTES_METADATA,
      routes: [{ log_id: 'r', fullname: 'x|r', duration: 180000 }, { log_id: 's', fullname: 'x|s', duration: 180000 }],
    });
    store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 'r', start: 0, end: 180000 });
    // Media keys the player by drive, as here
    const { rerender } = render(<Provider store={store}><DriveVideo key="x|r" /></Provider>);
    await act(async () => {});
    const [old] = hls.instances;
    const video = document.querySelector('video');
    Object.defineProperty(video, 'currentTime', { get: () => 42, set: () => {} });
    fireEvent.loadedMetadata(video);
    const resets = [];
    HTMLMediaElement.prototype.load = vi.fn(function load() { resets.push([this, this.isConnected]); });
    // what pushTimelineRange dispatches when history goes straight to another drive
    await act(async () => {
      store.dispatch({ type: Types.TIMELINE_PUSH_SELECTION, log_id: 's', start: 0, end: 180000 });
      store.dispatch(resetPlayback());
      store.dispatch(selectLoop(0, 180000));
    });
    await act(async () => rerender(<Provider store={store}><DriveVideo key="x|s" /></Provider>));
    // a reset on the page shows a white or black box on Android before the new picture
    expect(old.destroyedOnPage).toBeUndefined();
    expect(resets.filter(([el, onPage]) => el === video && onPage)).toEqual([]);
    expect(document.querySelector('video')).not.toBe(video);
    // the wall clock may tick a millisecond between the selection and the new player
    expect(hls.instances.at(-1).config.startPosition).toBeCloseTo(0, 1);
  });

  it('starts where the user seeked while the player code loaded', async () => {
    let store;
    hls.load = () => { store.dispatch(seek(60000)); return FakeHls; };
    store = renderPlayer();
    await act(async () => {});
    expect(hls.instances[0].config.startPosition).toEqual(60);
  });

  it('keeps the spinner until the video shows its first frame', async () => {
    const frames = [];
    HTMLMediaElement.prototype.requestVideoFrameCallback = vi.fn((cb) => frames.push(cb));
    renderPlayer();
    await act(async () => {});
    const video = document.querySelector('video');
    Object.defineProperty(video, 'paused', { get: () => false });
    // hls.js: the browser has data and is playing, but has not painted a frame yet
    fireEvent.loadedData(video);
    fireEvent.canPlay(video);
    fireEvent.playing(video);
    expect(screen.getByRole('status')).toHaveTextContent('Loading video');
    act(() => frames.forEach((cb) => cb()));
    expect(screen.getByRole('status')).toHaveTextContent('');
    cleanup();

    // native HLS (iOS) gets no frame report: 0.3 s of playing stands in for the paint, at any speed
    window.MediaSource = undefined;
    frames.length = 0;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    renderPlayer();
    const native = document.querySelector('video');
    Object.defineProperty(native, 'paused', { get: () => false });
    fireEvent.loadedData(native);
    fireEvent.playing(native);
    now += 100;
    fireEvent.timeUpdate(native);
    expect(screen.getByRole('status')).toHaveTextContent('Loading video');
    now += 200;
    fireEvent.timeUpdate(native);
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(frames).toEqual([]);
    // a new source starts over: the old play time does not count
    fireEvent.emptied(native);
    now += 1000;
    fireEvent.timeUpdate(native);
    expect(screen.getByRole('status')).toHaveTextContent('Loading video');
    vi.restoreAllMocks();
  });

  it('shows no spinner over the frame of a paused video when Play starts it', async () => {
    HTMLMediaElement.prototype.requestVideoFrameCallback = vi.fn();
    const store = renderPlayer();
    await act(async () => {});
    store.dispatch(pause());
    // a paused video paints its first frame at once
    fireEvent.loadedData(document.querySelector('video'));
    fireEvent.canPlay(document.querySelector('video'));
    await act(async () => store.dispatch(play(1)));
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('ignores the answer about a drive the user already left', async () => {
    window.MediaSource = undefined;
    let answer;
    global.fetch = vi.fn(() => new Promise((done) => { answer = done; }));
    renderPlayer();
    const video = document.querySelector('video');
    Object.defineProperty(video, 'error', { get: () => ({ code: 4 }) });
    fireEvent.error(video);
    // the user goes to another drive: Media unmounts this player
    cleanup();
    const failed = vi.fn();
    window.addEventListener('unhandledrejection', failed);
    await act(async () => answer({ status: 404 }));
    window.removeEventListener('unhandledrejection', failed);
    expect(failed).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('resets a leaving video only once it is off the page', async () => {
    vi.useFakeTimers();
    window.MediaSource = undefined;
    renderPlayer();
    const video = document.querySelector('video');
    expect(video.getAttribute('src')).toBeTruthy();
    const resets = [];
    HTMLMediaElement.prototype.load = vi.fn(function load() { resets.push(this.isConnected); });
    cleanup();
    // a reset on the page paints the box black on iOS before the next page shows
    vi.advanceTimersByTime(100);
    expect(resets).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(resets).toEqual([false]);
    expect(video.getAttribute('src')).toBeNull();
  });

  it('detaches hls.js from a leaving video only once it is off the page', async () => {
    renderPlayer();
    await act(async () => {});
    const [player] = hls.instances;
    vi.useFakeTimers();
    cleanup();
    expect(player.stopped).toBe(true);
    // a reset on the page paints the box white on Android Chrome before the next page shows
    vi.advanceTimersByTime(100);
    expect(player.destroyedOnPage).toBeUndefined();
    // a late error from the stopped player must not reach the unmounted component
    expect(() => player.handlers.hlsError('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError' })).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(player.destroyedOnPage).toBe(false);
  });
});
