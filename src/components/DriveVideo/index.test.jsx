import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import Hls from 'hls.js';

import DriveVideo, { RouteVideo } from '.';
import { api } from '../../api/backend';
import { currentOffset } from '../../timeline';
import { play, reducer, seek, selectLoop } from '../../timeline/playback';

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: vi.fn(() => 'https://example.com/route.m3u8') } } }));
vi.mock('hls.js', () => {
  class MockHls {
    static instances = [];
    static isSupported = vi.fn(() => true);
    static Events = { ERROR: 'error' };
    static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' };
    handlers = {};
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    stopLoad = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    on = (event, handler) => { this.handlers[event] = handler; };
    constructor() { MockHls.instances.push(this); }
  }
  return { default: MockHls };
});

const route = { fullname: 'dongle|route', duration: 60000, videoStartOffset: 2000, start_time_utc_millis: 0 };
let frames;

async function mount({ native = false, ...state } = {}) {
  HTMLMediaElement.prototype.canPlayType.mockReturnValue(native ? 'probably' : '');
  const store = createStore((current, action) => action.type === 'ROUTE'
    ? { ...current, currentRoute: action.route } : reducer(current, action), {
    currentRoute: route, desiredPlaySpeed: 1, seekRevision: 0, offset: 0,
    loop: { startTime: 0, duration: 60000 }, ...state,
  });
  const view = render(<Provider store={store}><DriveVideo /></Provider>);
  await act(async () => {});
  const video = screen.getByLabelText('Drive video');
  function metadata(time = 0) {
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 4 }, duration: { configurable: true, value: 58 },
    });
    video.currentTime = time;
    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
  }
  return { ...view, store, video, metadata };
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = frames.size + 1;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function getPaused() { return this.testPaused ?? true; });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function start() {
    this.testPaused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function stop() {
    if (this.testPaused === false) {
      this.testPaused = true;
      this.dispatchEvent(new Event('pause'));
    }
  });
  Hls.instances = [];
  Hls.isSupported.mockReturnValue(true);
  api.video.getQcameraStreamUrl.mockReturnValue('https://example.com/route.m3u8');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('uses native HLS when available, with inline native controls and muted startup', async () => {
  const { video, metadata } = await mount({ native: true });
  expect(Hls.instances).toHaveLength(0);
  expect(video).toHaveAttribute('controls');
  expect(video).toHaveAttribute('playsinline');
  expect(video.muted).toBe(true);
  metadata();
  expect(video.play).toHaveBeenCalled();
  expect(video.playbackRate).toBe(1);
});

it('plays MP4 directly without HLS, even when native HLS is unavailable', async () => {
  api.video.getQcameraStreamUrl.mockReturnValue('https://example.com/route.mp4?signature=test');
  const { video, metadata } = await mount();
  expect(video.src).toBe('https://example.com/route.mp4?signature=test');
  expect(Hls.instances).toHaveLength(0);
  metadata();
  expect(video.play).toHaveBeenCalled();
  Object.defineProperty(video, 'error', { value: { code: 4 }, configurable: true });
  fireEvent.error(video);
  expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
  expect(Hls.instances).toHaveLength(0);
});

it('discards an HLS import that completes after the route is closed', async () => {
  await act(async () => {
    const view = render(<RouteVideo src="https://example.com/route.m3u8" currentRoute={route} dispatch={vi.fn()} />);
    view.unmount();
  });
  expect(Hls.instances).toHaveLength(0);
});

it('falls back to HLS when advertised native support rejects the stream', async () => {
  const { video } = await mount({ native: true, offset: 15000 });
  Object.defineProperty(video, 'error', { value: { code: 4 }, configurable: true });
  await act(async () => fireEvent.error(video));
  expect(Hls.instances).toHaveLength(1);
  Object.defineProperties(video, {
    readyState: { value: 4, configurable: true }, duration: { value: 58, configurable: true },
  });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(13);
});

it('publishes media time without seeking or changing rate to chase a clock', async () => {
  const { video, metadata, store } = await mount();
  metadata();
  video.currentTime = 12.5;
  fireEvent.timeUpdate(video);
  expect(store.getState().offset).toBe(14500);
  video.currentTime = 12.75;
  expect(currentOffset()).toBe(14750);
  expect(video.currentTime).toBe(12.75);
  expect(video.playbackRate).toBe(1);
  fireEvent.waiting(video);
  vi.advanceTimersByTime(5000);
  expect(currentOffset()).toBe(14750);
});

it('keeps only the latest seek while loading and seeks immediately after metadata', async () => {
  const { video, metadata, store } = await mount();
  act(() => { store.dispatch(seek(10000)); store.dispatch(seek(25000)); });
  metadata();
  expect(video.currentTime).toBe(23);
  act(() => store.dispatch(seek(15000)));
  expect(video.currentTime).toBe(13);
  act(() => store.dispatch(seek(15000)));
  expect(video.currentTime).toBe(13);
});

it('reflects native pause, playback rate, and seeks in the shared state', async () => {
  const { video, metadata, store } = await mount();
  metadata();
  act(() => video.pause());
  expect(store.getState().desiredPlaySpeed).toBe(0);
  video.currentTime = 9;
  fireEvent.seeked(video);
  expect(store.getState().offset).toBe(11000);
  fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '2' } });
  expect(screen.getByLabelText('Playback speed')).toHaveValue('2');
  expect(store.getState().desiredPlaySpeed).toBe(0);
  act(() => { video.play(); });
  expect(store.getState().desiredPlaySpeed).toBe(2);
  expect(video.playbackRate).toBe(2);
});

it.each([0, 1])('preserves a speed selected before metadata without changing play intent (%s)', async (desiredPlaySpeed) => {
  const { video, metadata, store } = await mount({ native: true, desiredPlaySpeed });
  fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '2' } });
  // Loading a source can reset the native rate before metadata arrives.
  video.playbackRate = 1;
  fireEvent.rateChange(video);
  metadata();
  expect(video.playbackRate).toBe(2);
  expect(screen.getByLabelText('Playback speed')).toHaveValue('2');
  expect(store.getState().desiredPlaySpeed).toBe(desiredPlaySpeed ? 2 : 0);
  expect(video.paused).toBe(!desiredPlaySpeed);
});

it('loops from zero and clips to actual duration, preserving the selected speed', async () => {
  const { video, metadata, store } = await mount();
  metadata();
  act(() => { store.dispatch(selectLoop(0, 10000)); store.dispatch(play(2)); });
  video.currentTime = 8.1;
  act(() => [...frames.values()][0]());
  expect(video.currentTime).toBe(0);
  expect(video.playbackRate).toBe(2);
  act(() => store.dispatch(selectLoop(0, 90000)));
  video.currentTime = 58;
  Object.defineProperty(video, 'ended', { configurable: true, value: true });
  fireEvent.pause(video);
  fireEvent.ended(video);
  expect(video.currentTime).toBe(0);
  expect(store.getState().desiredPlaySpeed).toBe(2);
});

it('keeps the same player when switching map views and releases it on route changes', async () => {
  const view = await mount();
  view.metadata();
  const hls = Hls.instances[0];
  view.rerender(<Provider store={view.store}><DriveVideo mapView /></Provider>);
  expect(screen.getByLabelText('Drive video')).toBe(view.video);
  expect(hls.destroy).not.toHaveBeenCalled();
  act(() => view.store.dispatch({ type: 'ROUTE', route: { ...route, fullname: 'dongle|other' } }));
  expect(hls.destroy).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Drive video')).not.toBe(view.video);
});

it('offers a direct gesture to play after autoplay rejection', async () => {
  HTMLMediaElement.prototype.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  const { metadata, store } = await mount({ native: true });
  await act(async () => metadata());
  expect(store.getState().desiredPlaySpeed).toBe(0);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
  expect(store.getState().desiredPlaySpeed).toBe(1);
});

it('ignores nonfatal HLS errors, recovers media once, and offers retry after a fatal error', async () => {
  const { metadata } = await mount();
  metadata();
  const hls = Hls.instances[0];
  const emit = (data) => act(() => hls.handlers.error('error', data));
  emit({ fatal: false, type: 'networkError' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  emit({ fatal: true, type: 'mediaError' });
  expect(hls.recoverMediaError).toHaveBeenCalledOnce();
  emit({ fatal: true, type: 'mediaError' });
  expect(screen.getByRole('alert')).toBeVisible();
  await act(async () => fireEvent.click(screen.getByText('Try again')));
  expect(hls.destroy).toHaveBeenCalledOnce();
  expect(Hls.instances).toHaveLength(2);
  emit({ fatal: true, response: { code: 404 } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([404, 403])('reports fatal HTTP %s without an endless spinner', async (code) => {
  await mount();
  act(() => Hls.instances[0].handlers.error('error', { fatal: true, response: { code } }));
  expect(screen.getByRole('alert')).toHaveTextContent(code === 404 ? 'not uploaded' : 'expired');
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
});

it('times out stalled loading and ignores an interrupted play promise', async () => {
  HTMLMediaElement.prototype.play.mockRejectedValueOnce(new DOMException('Interrupted', 'AbortError'));
  const { video, metadata, store } = await mount();
  await act(async () => metadata());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.waiting(video);
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.getByRole('alert')).toHaveTextContent('taking too long');
  expect(store.getState().desiredPlaySpeed).toBe(0);
});

it('recovers when a selection without video is replaced by a playable selection', async () => {
  const { metadata, store } = await mount();
  await act(async () => { metadata(); store.dispatch(selectLoop(70000, 80000)); });
  expect(screen.getByRole('alert')).toHaveTextContent('no video in this selection');
  await act(async () => store.dispatch(selectLoop(0, 10000)));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('handles unavailable browser support', async () => {
  Hls.isSupported.mockReturnValue(false);
  await mount();
  expect(screen.getByRole('alert')).toHaveTextContent('browser cannot play');
});

it('reports an unavailable native stream when an HLS fallback is unsupported', async () => {
  Hls.isSupported.mockReturnValue(false);
  const { video } = await mount({ native: true });
  Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } });
  await act(async () => fireEvent.error(video));
  expect(screen.getByRole('alert')).toHaveTextContent('video is unavailable');
  expect(screen.getByRole('alert')).not.toHaveTextContent('updated browser');
});

it('preserves speed, mute state, and a pending seek on retry', async () => {
  const { video, metadata, store } = await mount({ offset: 15000, native: true });
  video.playbackRate = 2;
  video.muted = false;
  Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
  fireEvent.error(video);
  await act(async () => fireEvent.click(screen.getByText('Try again')));
  metadata();
  expect(video.currentTime).toBe(13);
  expect(video.muted).toBe(false);
  expect(store.getState().desiredPlaySpeed).toBe(2);
});

it('can seek while paused without starting playback or using rate zero', async () => {
  const { video, metadata, store } = await mount({ desiredPlaySpeed: 0 });
  metadata();
  act(() => store.dispatch(seek(15000)));
  expect(video.currentTime).toBe(13);
  expect(video.paused).toBe(true);
  expect(video.playbackRate).toBe(1);
  expect(video.play).not.toHaveBeenCalled();
});

it('honors pause in map view before metadata arrives', async () => {
  const view = await mount();
  view.rerender(<Provider store={view.store}><DriveVideo mapView /></Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  view.metadata();
  expect(view.video.paused).toBe(true);
  expect(view.video.play).not.toHaveBeenCalled();
});

it('does not apply stale play failures after unmount', async () => {
  let reject;
  HTMLMediaElement.prototype.play.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const { metadata, unmount, store } = await mount();
  metadata();
  unmount();
  await act(async () => reject(new DOMException('Blocked', 'NotAllowedError')));
  expect(store.getState().desiredPlaySpeed).toBe(1);
});
