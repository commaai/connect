import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DriveVideo } from './index';
import * as Types from '../../actions/types';

const hlsMock = vi.hoisted(() => ({ instances: [], supported: true }));
vi.mock('hls.js', () => ({ default: class {
  static isSupported() { return hlsMock.supported; }
  static Events = { ERROR: 'error', BUFFER_CODECS: 'codecs' };
  constructor() { this.handlers = {}; this.destroy = vi.fn(); this.stopLoad = vi.fn(); this.loadSource = vi.fn(); this.attachMedia = vi.fn(); hlsMock.instances.push(this); }
  on(name, handler) { this.handlers[name] = handler; }
} }));
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: vi.fn((route, exp, sig) => `https://video.example/${route}.m3u8?exp=${exp}&sig=${sig}`) } } }));
const fullname = 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00';
const route = { fullname, duration: 60000 };
let data;
let playResult;
let native;
let dispatch;
const props = () => ({ currentRoute: route, desiredPlaySpeed: 1, offset: null, seekRequest: null,
  loop: { startTime: 0, duration: 60000 }, isBufferingVideo: true, isMuted: true, dispatch, onAudioStatusChange: vi.fn() });
const status = video => {
  if (!data.has(video)) data.set(video, { time: 0, paused: true, ready: 0, duration: 60, ended: false, seeking: false });
  return data.get(video);
};
async function mounted(overrides = {}) {
  const p = { ...props(), ...overrides };
  const view = render(<DriveVideo {...p} />);
  const video = screen.getByLabelText('Drive video');
  await act(async () => { await Promise.resolve(); });
  return { view, video, p };
}
function ready(video) { status(video).ready = 2; fireEvent.loadedMetadata(video); }

beforeEach(() => {
  vi.clearAllMocks(); hlsMock.instances = []; hlsMock.supported = true;
  data = new WeakMap(); playResult = () => Promise.resolve(); native = true; dispatch = vi.fn();
  for (const [name, key] of [['currentTime', 'time'], ['paused', 'paused'], ['readyState', 'ready'], ['duration', 'duration'], ['ended', 'ended'], ['seeking', 'seeking']]) {
    vi.spyOn(HTMLMediaElement.prototype, name, 'get').mockImplementation(function () { return status(this)[key]; });
  }
  vi.spyOn(HTMLMediaElement.prototype, 'currentTime', 'set').mockImplementation(function (time) { status(this).time = time; if (time < status(this).duration) status(this).ended = false; });
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => native ? 'probably' : '');
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { status(this).paused = true; });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { return playResult(this); });
});
afterEach(() => vi.restoreAllMocks());

it('does not try to play an empty source and attaches signed native HLS URLs', async () => {
  const { video } = await mounted({ currentRoute: { ...route, share_exp: 1, share_sig: 'sig' } });
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(video).toHaveAttribute('playsinline');
  expect(video.src).toContain('exp=1&sig=sig');
  expect(hlsMock.instances).toHaveLength(0);
});

it('publishes actual video time without continually seeking or correcting playback speed', async () => {
  const { video, view, p } = await mounted(); ready(video);
  status(video).time = 12.345; status(video).paused = false;
  fireEvent.timeUpdate(video);
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_VIDEO_TIME, fullname, offset: 12345 });
  view.rerender(<DriveVideo {...p} offset={12345} />);
  expect(video.currentTime).toBe(12.345);
  expect(video.playbackRate).toBe(1);
});

it('resolves paused loading with current data without assigning playbackRate zero', async () => {
  const { video } = await mounted({ desiredPlaySpeed: 0 }); ready(video);
  expect(video.playbackRate).toBe(1);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_BUFFER_VIDEO, buffering: false });
});

it('applies only the latest pending seek when metadata arrives', async () => {
  const { video, view, p } = await mounted({ desiredPlaySpeed: 0 });
  view.rerender(<DriveVideo {...p} seekRequest={{ id: 1, fullname, offset: 10000 }} />);
  view.rerender(<DriveVideo {...p} seekRequest={{ id: 2, fullname, offset: 20009 }} />);
  ready(video);
  expect(video.currentTime).toBe(20.009);
});

it('maps video start offsets to the log clock and reports seek completion', async () => {
  const { video } = await mounted({ currentRoute: { ...route, videoStartOffset: 3000 }, desiredPlaySpeed: 0 });
  ready(video); status(video).time = 10; fireEvent.seeked(video);
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_VIDEO_TIME, fullname, offset: 13000 });
});

it('wraps a zero-based loop when the playing video reaches the end', async () => {
  const { video } = await mounted(); ready(video);
  status(video).time = 60; status(video).paused = false;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(0);
});

it('retains an end seek while paused and loops a selected range while playing', async () => {
  const { video, view, p } = await mounted({ desiredPlaySpeed: 0, loop: { startTime: 10000, duration: 5000 } });
  ready(video); status(video).time = 15; fireEvent.seeked(video);
  expect(video.currentTime).toBe(15);
  view.rerender(<DriveVideo {...p} desiredPlaySpeed={1} />);
  status(video).paused = false; fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(10);
});

it('uses an actionable play button for policy rejection without a perpetual spinner', async () => {
  playResult = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  const { video } = await mounted();
  await act(async () => { ready(video); await Promise.resolve(); });
  expect(await screen.findByRole('button', { name: 'Play video' })).toBeVisible();
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
  playResult = () => Promise.resolve();
  fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PLAY, speed: 1 });
});

it('ignores an aborted old play request after pause', async () => {
  let reject;
  playResult = () => new Promise((_resolve, fail) => { reject = fail; });
  const { video, view, p } = await mounted(); ready(video);
  view.rerender(<DriveVideo {...p} desiredPlaySpeed={0} />);
  await act(async () => { reject(Object.assign(new Error('interrupted'), { name: 'AbortError' })); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('syncs native pause to user intent and preserves its observed position', async () => {
  const { video } = await mounted(); ready(video);
  status(video).time = 5; fireEvent.pause(video);
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_VIDEO_TIME, fullname, offset: 5000 });
  expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
});

it('uses bundled HLS only when native HLS is unavailable and surfaces fatal 404s', async () => {
  native = false;
  const { video } = await mounted();
  const hls = hlsMock.instances[0];
  expect(hls.attachMedia).toHaveBeenCalledWith(video);
  act(() => hls.handlers.error('error', { fatal: false, response: { code: 404 } }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  act(() => hls.handlers.error('error', { fatal: true, response: { code: 404 } }));
  expect(screen.getByRole('alert')).toHaveTextContent('has not uploaded yet or has been deleted');
  fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
  await act(async () => { await Promise.resolve(); });
  expect(hls.destroy).toHaveBeenCalledOnce();
  expect(hlsMock.instances).toHaveLength(2);
});

it('reports native audio tracks and HLS audio codec discovery', async () => {
  native = false;
  const { p, video } = await mounted();
  act(() => hlsMock.instances[0].handlers.codecs('codecs', { audio: {} }));
  ready(video);
  fireEvent.seeked(video);
  expect(p.onAudioStatusChange).toHaveBeenLastCalledWith(true);
});

it('tears down listeners/HLS and ignores late events from the old route', async () => {
  native = false;
  const { view, video, p } = await mounted();
  const old = hlsMock.instances[0];
  view.rerender(<DriveVideo {...p} currentRoute={{ ...route, fullname: 'new-route' }} />);
  await act(async () => { await Promise.resolve(); });
  dispatch.mockClear();
  act(() => old.handlers.error('error', { fatal: true }));
  expect(old.destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  view.unmount(); dispatch.mockClear(); fireEvent.timeUpdate(video);
  expect(dispatch).not.toHaveBeenCalled();
});

it('turns a loading timeout into retry UI and releases its timer on unmount', async () => {
  vi.useFakeTimers();
  const { view } = await mounted();
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.getByRole('alert')).toHaveTextContent('taking too long');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

it('clears a stall timeout when media progress resumes without another playing event', async () => {
  vi.useFakeTimers();
  const { video, view } = await mounted();
  ready(video); status(video).paused = false;
  fireEvent.waiting(video);
  status(video).time = 1; fireEvent.timeUpdate(video);
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_VIDEO_TIME, fullname, offset: 1000 });
  view.unmount(); vi.useRealTimers();
});

it('seeks to a nonzero loop start before playing from the native media endpoint', async () => {
  const { video, view, p } = await mounted({ desiredPlaySpeed: 0, loop: { startTime: 10000, duration: 50000 } });
  ready(video); status(video).time = 60; status(video).ended = true;
  let positionAtPlay;
  playResult = element => { positionAtPlay = element.currentTime; return Promise.resolve(); };
  view.rerender(<DriveVideo {...p} desiredPlaySpeed={1} />);
  expect(positionAtPlay).toBe(10);
});


it('resumes a natural end loop and ignores the old queued native pause event', async () => {
  const { video } = await mounted({ loop: { startTime: 10000, duration: 50000 } });
  ready(video);
  status(video).time = 60; status(video).paused = true; status(video).ended = true;
  playResult = element => { status(element).paused = false; return Promise.resolve(); };
  await act(async () => { await Promise.resolve(); });
  dispatch.mockClear();
  fireEvent.timeUpdate(video);
  fireEvent.pause(video);
  fireEvent.ended(video);
  expect(video.currentTime).toBe(10);
  expect(video.paused).toBe(false);
  expect(dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_PAUSE });
});


it('accepts the first new seek after a same-route reset reuses its numeric id', async () => {
  const { video, view, p } = await mounted({ desiredPlaySpeed: 0 });
  ready(video);
  view.rerender(<DriveVideo {...p} seekRequest={{ id: 1, fullname, offset: 20000 }} />);
  expect(video.currentTime).toBe(20);
  view.rerender(<DriveVideo {...p} seekRequest={null} offset={null} />);
  view.rerender(<DriveVideo {...p} seekRequest={{ id: 1, fullname, offset: 30000 }} />);
  expect(video.currentTime).toBe(30);
});

it('ignores a queued playing event when the media has already paused', async () => {
  const { video } = await mounted({ desiredPlaySpeed: 0 });
  ready(video); dispatch.mockClear(); fireEvent.playing(video);
  expect(dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_PLAY, speed: 1 });
});


it('uses current media time when an old frame callback arrives after a paused seek', async () => {
  let frame;
  HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn(callback => { frame = callback; return 1; });
  try {
    const { video, view } = await mounted({ desiredPlaySpeed: 0 });
    ready(video); status(video).time = 3.5; fireEvent.seeked(video);
    dispatch.mockClear();
    act(() => frame(100, { mediaTime: 0.208333 }));
    expect(dispatch).toHaveBeenCalledWith({ type: Types.ACTION_VIDEO_TIME, fullname, offset: 3500 });
    view.unmount();
  } finally { delete HTMLVideoElement.prototype.requestVideoFrameCallback; }
});

it('does not show loading for a paused ready video after its seek has completed', async () => {
  const { video } = await mounted({ desiredPlaySpeed: 0 });
  ready(video); dispatch.mockClear(); fireEvent.stalled(video); fireEvent.waiting(video);
  expect(dispatch).not.toHaveBeenCalledWith({ type: Types.ACTION_BUFFER_VIDEO, buffering: true });
});
