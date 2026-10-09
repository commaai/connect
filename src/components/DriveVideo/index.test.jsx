import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { DriveVideo } from './index';
import * as Types from '../../actions/types';

vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: (fullname, _, signature) => `/${fullname}.m3u8?sig=${signature ?? ""}` } } }));
vi.mock('hls.js', () => ({ default: { isSupported: () => false } }));

const props = () => ({ currentRoute: { fullname: 'route-a', videoStartOffset: 0 },
  offset: 10000, seekRevision: 1, desiredPlaySpeed: 1, isMuted: true, visible: true,
  dispatch: vi.fn(), onAudioStatusChange: vi.fn() });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n#EXTINF:60,\nvideo.ts\n' }));
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function ready(video) {
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  fireEvent.loadedMetadata(video);
  fireEvent.seeked(video);
}

it('retains the latest seek until metadata is available', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  view.rerender(<DriveVideo {...initial} offset={25000} seekRevision={2} />);
  const video = view.container.querySelector('video');
  ready(video);
  expect(video.currentTime).toBe(25);
});

it('keeps the same element in Map view and leaves recovery visible', async () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = view.container.querySelector('video');
  view.rerender(<DriveVideo {...initial} visible={false} />);
  expect(view.container.querySelector('video')).toBe(video);
  fireEvent.error(video);
  expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible();
});

it('provides a gesture control after autoplay denial', async () => {
  HTMLMediaElement.prototype.play.mockRejectedValue(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }));
  const view = render(<DriveVideo {...props()} />);
  ready(view.container.querySelector('video'));
  expect(await screen.findByRole('button', { name: 'Play' })).toBeVisible();
});

it('ignores rejected play promises from a replaced source', async () => {
  let rejectOld;
  HTMLMediaElement.prototype.play.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  ready(view.container.querySelector('video'));
  expect(rejectOld).toBeTypeOf('function');
  view.rerender(<DriveVideo {...initial} currentRoute={{ fullname: 'route-b' }} offset={0} seekRevision={2} />);
  rejectOld(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});


it('retains a newer seek made while an error is visible through Retry', async () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = view.container.querySelector('video');
  fireEvent.error(video);
  view.rerender(<DriveVideo {...initial} offset={45000} seekRevision={2} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  ready(video);
  expect(video.currentTime).toBe(45);
});

it('samples every frame without dispatching a Redux snapshot for every frame', () => {
  let nextFrame;
  HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn(callback => { nextFrame = callback; return 1; });
  HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn();
  try {
    const initial = props();
    const view = render(<DriveVideo {...initial} />);
    const video = view.container.querySelector('video');
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    ready(video);
    initial.dispatch.mockClear();
    nextFrame(0, { mediaTime: 10.033 });
    nextFrame(0, { mediaTime: 10.066 });
    expect(initial.dispatch.mock.calls.filter(([action]) => action.type === Types.ACTION_MEDIA_POSITION)).toHaveLength(0);
    expect(initial.dispatch.mock.calls.filter(([action]) => action.type === Types.ACTION_BUFFER_VIDEO)).toHaveLength(1);
    fireEvent.timeUpdate(video);
    expect(initial.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: Types.ACTION_MEDIA_POSITION, offset: 10066 }));
    // Refreshing a signed URL must retain the precise clock, not the last Redux snapshot.
    nextFrame(0, { mediaTime: 10.1 });
    view.rerender(<DriveVideo {...initial} currentRoute={{ ...initial.currentRoute, share_sig: 'refreshed' }} />);
    ready(video);
    expect(video.currentTime).toBe(10.1);
    view.unmount();
  } finally {
    delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
  }
});

it('accepts a decoded seek landing without repeatedly assigning the target', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = view.container.querySelector('video');
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  fireEvent.loadedMetadata(video);
  expect(video.currentTime).toBe(10);
  // Simulate a browser settling just past an undecodable fragment boundary.
  video.currentTime = 10.1;
  fireEvent.seeked(video);
  expect(video.currentTime).toBe(10.1);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  expect(initial.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_MEDIA_POSITION, offset: 10100 }));
});

it('uses late camera timing metadata without reloading the stream', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = view.container.querySelector('video');
  ready(video);
  const loads = HTMLMediaElement.prototype.load.mock.calls.length;
  view.rerender(<DriveVideo {...initial} currentRoute={{ ...initial.currentRoute, videoStartOffset: 500 }} />);
  fireEvent.timeUpdate(video);
  expect(initial.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_MEDIA_POSITION, offset: 10500 }));
  expect(video.currentTime).toBe(10);
  expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loads);
});

it('detects native audio tracks that appear after initial readiness events', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = view.container.querySelector('video');
  const tracks = [];
  Object.defineProperty(video, 'audioTracks', { configurable: true, value: tracks });
  ready(video);
  expect(initial.onAudioStatusChange).not.toHaveBeenCalledWith(true);
  initial.onAudioStatusChange.mockClear();
  tracks.push({ kind: 'main' });
  fireEvent.timeUpdate(video);
  fireEvent.timeUpdate(video);
  expect(initial.onAudioStatusChange).toHaveBeenCalledTimes(1);
  expect(initial.onAudioStatusChange).toHaveBeenCalledWith(true);
});

it('lets the gesture Play control resume after intent was paused', async () => {
  HTMLMediaElement.prototype.play.mockRejectedValueOnce(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }));
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  ready(view.container.querySelector('video'));
  const button = await screen.findByRole('button', { name: 'Play' });
  view.rerender(<DriveVideo {...initial} desiredPlaySpeed={0} />);
  fireEvent.click(button);
  expect(initial.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_PLAY, speed: 1 }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
});

it('maps native HLS missing footage and rejects a queued frame from before the gap', async () => {
  fetch.mockResolvedValueOnce({ ok: true, text: async () => '#EXTM3U\n#EXTINF:60,0\n0/qcamera.ts\n#EXTINF:60,2\n2/qcamera.ts\n' });
  let nextFrame;
  HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn(callback => { nextFrame = callback; return 1; });
  HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn();
  try {
    const initial = { ...props(), offset: 85000, desiredPlaySpeed: 0, isMuted: false };
    const view = render(<DriveVideo {...initial} />);
    const video = view.container.querySelector('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    fireEvent.loadedMetadata(video);
    await waitFor(() => expect(video.currentTime).toBeCloseTo(60.001));
    fireEvent.seeked(video);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(video.muted).toBe(true);
    nextFrame(0, { mediaTime: 60.001 });
    expect(video.muted).toBe(false);
    expect(initial.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: Types.ACTION_MEDIA_POSITION, offset: 120001 }));
    initial.dispatch.mockClear();
    nextFrame(0, { mediaTime: 59.988 });
    expect(initial.dispatch).not.toHaveBeenCalled();
    view.unmount();
  } finally {
    delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
  }
});

it('resumes a newer seek after the previous play promise finishes', async () => {
  let resolveOld;
  HTMLMediaElement.prototype.play.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = view.container.querySelector('video');
  ready(video);
  view.rerender(<DriveVideo {...initial} offset={45000} seekRevision={2} />);
  fireEvent.seeked(video);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  resolveOld();
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
  expect(video.currentTime).toBe(45);
});
