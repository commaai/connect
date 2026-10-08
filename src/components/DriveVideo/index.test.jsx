import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Hls from 'hls.js';
import { DriveVideo, Playback } from '.';
import { api } from '../../api/backend';
import { pause, setPlaySpeed, videoPosition } from '../../timeline/playback';

vi.mock('hls.js', () => {
  class MockHls {
    static isSupported = vi.fn(() => true);
    static Events = { BUFFER_CODECS: 'codecs', ERROR: 'error', MANIFEST_PARSED: 'manifest' };
    static ErrorTypes = { MEDIA_ERROR: 'media' };
    static instances = [];
    handlers = {};
    constructor() { MockHls.instances.push(this); }
    on(event, handler) { this.handlers[event] = handler; }
    startLoad = vi.fn();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    detachMedia = vi.fn();
    stopLoad = vi.fn();
    recoverMediaError = vi.fn();
  }
  return { default: MockHls };
});

let props;
function setup(extra = {}) {
  props = {
    src: 'https://example.com/route.m3u8', currentRoute: { fullname: 'route', videoStartOffset: 5000 },
    seekOffset: 15000, offset: null, seekRevision: 1, desiredPlaySpeed: 1, isPlaying: true,
    isMuted: true, dispatch: vi.fn(), onAudioStatusChange: vi.fn(), ...extra,
  };
  const view = render(<Playback {...props} />);
  const video = screen.getByLabelText('Route video');
  return { ...view, video, update: (changes) => { props = { ...props, ...changes }; view.rerender(<Playback {...props} />); } };
}
function media(video, values) {
  for (const [key, value] of Object.entries(values)) Object.defineProperty(video, key, { configurable: true, value, writable: true });
}

beforeEach(() => {
  Hls.instances.length = 0;
  vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('queues the latest seek until metadata is ready and converts route milliseconds', () => {
  const { video, update } = setup();
  update({ seekOffset: 25000, seekRevision: 2 });
  expect(video.currentTime).toBe(0);
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(20);
  expect(props.dispatch).toHaveBeenCalledWith(videoPosition('route', 25000, 2));
});

it('reports actual media time and applies seeks without playback-rate drift correction', () => {
  const { video, update } = setup();
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  video.currentTime = 12;
  fireEvent.timeUpdate(video);
  expect(props.dispatch).toHaveBeenCalledWith(videoPosition('route', 17000, 1));
  expect(video.playbackRate).toBe(1);
  update({ seekOffset: 45000, seekRevision: 2 });
  expect(video.currentTime).toBe(40);
  update({ isPlaying: false });
  expect(video.pause).toHaveBeenCalled();
  expect(video.playbackRate).toBe(1);
});

it('settles a paused seek and preserves the actual position during buffering', () => {
  const { video } = setup({ isPlaying: false });
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  media(video, { seeking: true, currentTime: 30 });
  props.dispatch.mockClear();
  fireEvent.waiting(video);
  fireEvent.timeUpdate(video);
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
  expect(props.dispatch).not.toHaveBeenCalledWith(videoPosition('route', 35000, 1));
  media(video, { seeking: false });
  fireEvent.seeked(video);
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
  expect(props.dispatch).toHaveBeenCalledWith(videoPosition('route', 35000, 1));
});

it('loops from the video clock even when the range starts at zero', () => {
  const { video } = setup({ currentRoute: { fullname: 'route', videoStartOffset: 0 }, seekOffset: 0, loop: { startTime: 0, duration: 10000 } });
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  video.currentTime = 10;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(0);
});

it('offers a user-gesture Play action when autoplay is blocked', async () => {
  const { video } = setup();
  video.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  media(video, { readyState: 4, duration: 60 });
  await act(async () => fireEvent.loadedMetadata(video));
  expect(screen.getByRole('alert')).toHaveTextContent('Tap Play');
  expect(props.dispatch).toHaveBeenCalledWith(pause());
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  expect(video.play).toHaveBeenCalledTimes(2);
});

it('uses native HLS and detects audio on iOS without another player', () => {
  const { video } = setup();
  expect(Hls.instances).toHaveLength(0);
  expect(video).toHaveAttribute('playsinline');
  media(video, { readyState: 4, duration: 60, audioTracks: { length: 1 } });
  fireEvent.loadedMetadata(video);
  expect(props.onAudioStatusChange).toHaveBeenCalledWith(true);
});

it('cleans up HLS and ignores callbacks from a replaced player', () => {
  Hls.isSupported.mockReturnValue(true);
  HTMLMediaElement.prototype.canPlayType.mockReturnValue('');
  const { unmount } = setup();
  const hls = Hls.instances[0];
  expect(hls.loadSource).toHaveBeenCalledWith(props.src);
  hls.handlers.codecs(null, { audio: {} });
  expect(props.onAudioStatusChange).toHaveBeenCalledWith(true);
  unmount();
  props.dispatch.mockClear();
  hls.handlers.error(null, { fatal: true, type: 'network', response: { code: 404 } });
  expect(props.dispatch).not.toHaveBeenCalled();
  expect(hls.destroy).toHaveBeenCalled();
});

it('recovers a fatal media error once, then exposes retry at the same position', () => {
  Hls.isSupported.mockReturnValue(true);
  HTMLMediaElement.prototype.canPlayType.mockReturnValue('');
  const { video } = setup({ offset: 20000 });
  const hls = Hls.instances[0];
  act(() => hls.handlers.error(null, { fatal: true, type: 'media' }));
  expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
  expect(hls.startLoad).toHaveBeenCalledWith(15);
  fireEvent.error(video);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  act(() => hls.handlers.error(null, { fatal: true, type: 'media' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(hls.destroy).toHaveBeenCalled();
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(15);
});

it('ends indefinite loading with a recoverable error', () => {
  vi.useFakeTimers();
  setup();
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.getByRole('alert')).toHaveTextContent('taking too long');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
});


it('keeps route time stable when the camera start offset arrives late', () => {
  const { video, update } = setup({ currentRoute: { fullname: 'route', videoStartOffset: 0 }, seekOffset: 15000, offset: 15000 });
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(15);
  update({ currentRoute: { fullname: 'route', videoStartOffset: 5000 } });
  expect(video.currentTime).toBe(10);
});

it('keeps native mute controls synchronized and mutes map view without losing the preference', () => {
  const onMuteChange = vi.fn();
  const { video, update } = setup({ isMuted: false, onMuteChange });
  media(video, { muted: true });
  fireEvent.volumeChange(video);
  expect(onMuteChange).toHaveBeenCalledWith(true);
  onMuteChange.mockClear();
  update({ hidden: true });
  fireEvent.volumeChange(video);
  expect(onMuteChange).not.toHaveBeenCalled();
});

it('reports missing segments and leaves recoverable HLS errors to the engine', () => {
  Hls.isSupported.mockReturnValue(true);
  HTMLMediaElement.prototype.canPlayType.mockReturnValue('');
  setup();
  const hls = Hls.instances[0];
  act(() => hls.handlers.error(null, { fatal: false, type: 'network', response: { code: 404 } }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  act(() => hls.handlers.error(null, { fatal: true, type: 'network', response: { code: 404 } }));
  expect(screen.getByRole('alert')).toHaveTextContent('has not uploaded yet or has been deleted');
});

it('does not let a stale play rejection replace a retried source', async () => {
  let reject;
  const { video } = setup();
  video.play.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  fireEvent.error(video);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await act(async () => reject(new DOMException('Blocked', 'NotAllowedError')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});


it('loops a selected range when video ends before the route logs', () => {
  const { video } = setup({ loop: { startTime: 15000, duration: 60000 } });
  media(video, { readyState: 4, duration: 30 });
  fireEvent.loadedMetadata(video);
  video.currentTime = 30;
  fireEvent.ended(video);
  expect(video.currentTime).toBe(10);
});

it('stops without a seek loop when the selection is beyond the video duration', () => {
  const { video } = setup({ seekOffset: 45000, loop: { startTime: 45000, duration: 10000 } });
  media(video, { readyState: 4, duration: 30 });
  fireEvent.loadedMetadata(video);
  expect(screen.getByRole('alert')).toHaveTextContent('No video is available');
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  fireEvent.ended(video);
  expect(props.dispatch).toHaveBeenCalledWith(pause());
});


it('uses HLS.js on desktop even when the browser advertises native HLS', () => {
  Hls.isSupported.mockReturnValue(true);
  setup();
  expect(Hls.instances).toHaveLength(1);
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
});

it('keeps native HLS on iOS even if MediaSource is available', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  Hls.isSupported.mockReturnValue(true);
  const { video } = setup();
  expect(Hls.instances).toHaveLength(0);
  expect(video.src).toBe(props.src);
  expect(video.load).toHaveBeenCalled();
});


it('keeps native HLS on iPadOS with its desktop user agent', () => {
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 });
  Hls.isSupported.mockReturnValue(true);
  const { video } = setup();
  expect(Hls.instances).toHaveLength(0);
  expect(video.load).toHaveBeenCalled();
});


it('starts HLS at the latest requested position instead of downloading from zero', () => {
  Hls.isSupported.mockReturnValue(true);
  const { update } = setup();
  const hls = Hls.instances[0];
  update({ seekOffset: 45000, seekRevision: 2 });
  act(() => hls.handlers.manifest());
  expect(hls.startLoad).toHaveBeenCalledWith(40);
});

it('changes the playback rate while paused without resuming', () => {
  const { video, update } = setup({ isPlaying: false });
  media(video, { readyState: 4, duration: 60, paused: true });
  fireEvent.loadedMetadata(video);
  video.play.mockClear();
  update({ desiredPlaySpeed: 2 });
  expect(video.play).not.toHaveBeenCalled();
  expect(video.playbackRate).toBe(2);
  fireEvent.rateChange(video);
  expect(props.dispatch).toHaveBeenCalledWith(setPlaySpeed(video.playbackRate));
});

it('delays the spinner for transient buffering and keeps paused frames visible', () => {
  vi.useFakeTimers();
  const { video, update } = setup();
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  fireEvent.waiting(video);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
  fireEvent.canPlay(video);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
  fireEvent.waiting(video);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByLabelText('Loading video')).toBeVisible();
  update({ isPlaying: false });
  fireEvent.waiting(video);
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('retries the requested position when setting currentTime fails', () => {
  const { video } = setup({ offset: 7000 });
  media(video, { readyState: 4, duration: 60 });
  Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 2, set: () => { throw new Error('Not ready'); } });
  fireEvent.loadedMetadata(video);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to seek');
  media(video, { currentTime: 2 });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(10);
});


it('keeps a fatal error visible when its pause reaches the connected player', () => {
  const { video, update } = setup();
  media(video, { readyState: 4, duration: 60 });
  fireEvent.loadedMetadata(video);
  fireEvent.error(video);
  update({ isPlaying: false });
  fireEvent.canPlay(video);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load');
});

it('clears an autoplay prompt only after the gesture actually starts playback', async () => {
  const { video } = setup();
  video.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  media(video, { readyState: 4, duration: 60 });
  await act(async () => fireEvent.loadedMetadata(video));
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  fireEvent.playing(video);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});


it('replaces the player when demo routes share the same stream URL', () => {
  vi.spyOn(api.video, 'getQcameraStreamUrl').mockReturnValue('https://example.com/demo.m3u8');
  const initialProps = { currentRoute: { fullname: 'demo-1' }, dispatch: vi.fn(), desiredPlaySpeed: 1, isPlaying: true, isMuted: true };
  const view = render(<DriveVideo {...initialProps} />);
  const first = screen.getByLabelText('Route video');
  view.rerender(<DriveVideo {...initialProps} currentRoute={{ fullname: 'demo-2' }} />);
  expect(screen.getByLabelText('Route video')).not.toBe(first);
});


it('stops native playback and releases its source on unmount', () => {
  const { video, unmount } = setup();
  unmount();
  expect(video.pause).toHaveBeenCalled();
  expect(video).not.toHaveAttribute('src');
  expect(video.load).toHaveBeenCalledTimes(2);
});


it('releases a failed HLS source and hides native loading controls until retry', () => {
  Hls.isSupported.mockReturnValue(true);
  const { video } = setup();
  const hls = Hls.instances[0];
  act(() => hls.handlers.error(null, { fatal: true, type: 'network' }));
  expect(hls.detachMedia).toHaveBeenCalledTimes(1);
  expect(video.pause).toHaveBeenCalled();
  expect(video).not.toHaveAttribute('src');
  expect(video).not.toHaveAttribute('controls');
  expect(screen.queryByLabelText('Loading video')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(video).toHaveAttribute('controls');
  expect(Hls.instances).toHaveLength(2);
});

it('retains the source when autoplay only needs a user gesture', async () => {
  const { video } = setup();
  video.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  media(video, { readyState: 4, duration: 60 });
  await act(async () => fireEvent.loadedMetadata(video));
  expect(video).toHaveAttribute('src', props.src);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  fireEvent.playing(video);
  expect(video).toHaveAttribute('controls');
});
