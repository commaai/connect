import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import Hls from 'hls.js';
import { RouteVideo } from './index';
import { currentOffset, requestVideoPlay, setVideoMuted } from '../../timeline';
import * as Types from '../../actions/types';

vi.mock('hls.js', () => {
  const MockHls = vi.fn(function () {
    this.handlers = {};
    this.on = (event, callback) => { this.handlers[event] = callback; };
    this.attachMedia = vi.fn();
    this.loadSource = vi.fn();
    this.destroy = vi.fn();
  });
  MockHls.isSupported = vi.fn(() => true);
  MockHls.Events = { MEDIA_ATTACHED: 'attached', BUFFER_CODECS: 'codecs', ERROR: 'error' };
  MockHls.ErrorTypes = { NETWORK_ERROR: 'networkError' };
  return { default: MockHls };
});

let frame;
let props;
let playSpy;
let pauseSpy;
beforeEach(() => {
  vi.clearAllMocks();
  Hls.isSupported.mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frame = callback; return 1; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  props = {
    src: 'https://video.example/route.m3u8', dispatch: vi.fn(), desiredPlaySpeed: 1,
    isMuted: true, onAudioStatusChange: vi.fn(), onMuteChange: vi.fn(),
    offset: 10000, seekVersion: 0, loop: { startTime: 0, duration: 60000 },
    currentRoute: { fullname: 'route', duration: 60000, videoStartOffset: 500 },
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function ready(video, time = 0) {
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    duration: { configurable: true, value: 59.5 },
  });
  video.currentTime = time;
  fireEvent.loadedMetadata(video);
}

it('uses native HLS and waits for metadata to seek, then follows the media clock', () => {
  const { rerender } = render(<RouteVideo {...props} />);
  const video = screen.getByLabelText('Drive video');
  expect(Hls).not.toHaveBeenCalled();
  ready(video);
  expect(video.currentTime).toBe(9.5);
  video.currentTime = 11;
  fireEvent.timeUpdate(video);
  expect(currentOffset()).toBe(11500);
  expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_VIDEO_PROGRESS, route: 'route', offset: 11500, seekVersion: 0 });
  rerender(<RouteVideo {...props} offset={11500} />);
  expect(video.currentTime).toBe(11); // progress is not another seek
  rerender(<RouteVideo {...props} offset={30000} seekVersion={1} />);
  expect(video.currentTime).toBe(29.5);
});

it('keeps only the latest seek while metadata is loading and applies late video origins', () => {
  const { rerender } = render(<RouteVideo {...props} />);
  rerender(<RouteVideo {...props} offset={20000} seekVersion={1} />);
  const video = screen.getByLabelText('Drive video');
  ready(video);
  expect(video.currentTime).toBe(19.5);
  rerender(<RouteVideo {...props} offset={20000} seekVersion={1} currentRoute={{ ...props.currentRoute, videoStartOffset: 1000 }} />);
  expect(video.currentTime).toBe(19);
});

it('buffers without pausing or changing playback rate', () => {
  render(<RouteVideo {...props} desiredPlaySpeed={2} />);
  const video = screen.getByLabelText('Drive video');
  ready(video);
  pauseSpy.mockClear();
  fireEvent.waiting(video);
  expect(screen.getByRole('status', { name: 'Loading video' })).toBeVisible();
  expect(pauseSpy).not.toHaveBeenCalled();
  expect(video.playbackRate).toBe(2);
  fireEvent.playing(video);
  expect(screen.queryByRole('status', { name: 'Loading video' })).toBeNull();
});

it('loops at zero and at the physical end without treating ended as a user pause', () => {
  render(<RouteVideo {...props} offset={0} />);
  const video = screen.getByLabelText('Drive video');
  ready(video);
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  video.currentTime = 59.5;
  act(() => frame());
  expect(video.currentTime).toBe(0);
  Object.defineProperty(video, 'ended', { configurable: true, value: true });
  props.dispatch.mockClear();
  fireEvent.pause(video);
  expect(props.dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
  fireEvent.ended(video);
  expect(video.currentTime).toBe(0);
  expect(playSpy).toHaveBeenCalledTimes(2);
});

it('reports native play, pause, rate and mute changes to the external controls', () => {
  render(<RouteVideo {...props} />);
  const video = screen.getByLabelText('Drive video');
  ready(video);
  video.playbackRate = 2;
  fireEvent.play(video);
  expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PLAY, speed: 2 });
  fireEvent.pause(video);
  expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PAUSE });
  video.muted = false;
  fireEvent.volumeChange(video);
  expect(props.onMuteChange).toHaveBeenCalledWith(false);
  act(() => { requestVideoPlay(4); setVideoMuted(true); });
  expect(video.playbackRate).toBe(4);
  expect(video.muted).toBe(true);
});

it('offers a gesture-based play action when autoplay is rejected', async () => {
  playSpy.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
  render(<RouteVideo {...props} />);
  ready(screen.getByLabelText('Drive video'));
  const button = await screen.findByRole('button', { name: 'Play', exact: true });
  expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
  fireEvent.click(button);
  expect(playSpy).toHaveBeenCalledTimes(2);
  fireEvent.playing(screen.getByLabelText('Drive video'));
  expect(screen.queryByText('Tap play to start the video.')).toBeNull();
});

it('ignores interrupted plays and late rejections after unmount', async () => {
  playSpy.mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'));
  const { unmount } = render(<RouteVideo {...props} />);
  ready(screen.getByLabelText('Drive video'));
  await act(async () => {});
  expect(screen.queryByRole('alert')).toBeNull();
  unmount();
  expect(pauseSpy).toHaveBeenCalled();
});

it('uses HLS on other browsers, allows transient recovery, and retries fatal errors', () => {
  Hls.isSupported.mockReturnValue(true);
  HTMLMediaElement.prototype.canPlayType.mockReturnValue('');
  render(<RouteVideo {...props} />);
  const hls = Hls.mock.instances[0];
  expect(hls.attachMedia).toHaveBeenCalledWith(screen.getByLabelText('Drive video'));
  act(() => hls.handlers.attached());
  expect(hls.loadSource).toHaveBeenCalledWith(props.src);
  act(() => hls.handlers.codecs('codecs', { audio: {} }));
  expect(props.onAudioStatusChange).toHaveBeenCalledWith(true);
  act(() => hls.handlers.error('error', { fatal: false }));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => hls.handlers.error('error', { fatal: true, response: { code: 404 } }));
  expect(screen.getByRole('alert')).toHaveTextContent('not uploaded yet');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(hls.destroy).toHaveBeenCalledOnce();
  expect(Hls).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('preserves explicit pause on source load and stops when no loop is selected', () => {
  render(<RouteVideo {...props} desiredPlaySpeed={0} loop={null} />);
  expect(playSpy).not.toHaveBeenCalled();
  const video = screen.getByLabelText('Drive video');
  ready(video);
  fireEvent.ended(video);
  expect(props.dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PAUSE });
});

it('prefers native HLS on Apple browsers even when MSE is available', () => {
  Hls.isSupported.mockReturnValue(true);
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
  render(<RouteVideo {...props} />);
  expect(Hls).not.toHaveBeenCalled();
});

it('uses HLS on Chromium even if it advertises native HLS support', () => {
  Hls.isSupported.mockReturnValue(true);
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');
  render(<RouteVideo {...props} />);
  expect(Hls).toHaveBeenCalledOnce();
  expect(playSpy).not.toHaveBeenCalled(); // no source yet: do not request play
});

it('clamps native control seeks to the selected range', () => {
  render(<RouteVideo {...props} offset={10000} loop={{ startTime: 10000, duration: 10000 }} />);
  const video = screen.getByLabelText('Drive video');
  ready(video);
  video.currentTime = 40;
  fireEvent.seeked(video);
  expect(video.currentTime).toBe(19.5);
  video.currentTime = 0;
  fireEvent.seeked(video);
  expect(video.currentTime).toBe(9.5);
});

it('ignores a rejected play promise after changing sources', async () => {
  let rejectPlay;
  playSpy.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPlay = reject; }));
  const { rerender } = render(<RouteVideo key="old" {...props} />);
  ready(screen.getByLabelText('Drive video'));
  rerender(<RouteVideo key="new" {...props} src="https://video.example/new.m3u8" />);
  props.dispatch.mockClear();
  await act(async () => { rejectPlay(new DOMException('old failure', 'NotAllowedError')); });
  expect(props.dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
  expect(screen.queryByText('Tap play to start the video.')).toBeNull();
});

it('stops a selection entirely before the first video frame and allows a new selection', () => {
  const { rerender } = render(<RouteVideo {...props} offset={0} loop={{ startTime: 0, duration: 100 }} />);
  ready(screen.getByLabelText('Drive video'));
  expect(screen.getByText('This selection has no video. Choose a later part of the drive.')).toBeVisible();
  expect(playSpy).not.toHaveBeenCalled();
  expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
  rerender(<RouteVideo {...props} seekVersion={1} />);
  expect(screen.queryByText('This selection has no video. Choose a later part of the drive.')).toBeNull();
});

it.each([2, 3, 4])('shows a retryable native media error (code %s)', (code) => {
  render(<RouteVideo {...props} />);
  const video = screen.getByLabelText('Drive video');
  Object.defineProperty(video, 'error', { configurable: true, value: { code } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fireEvent.error(video);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  expect(props.dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
});
