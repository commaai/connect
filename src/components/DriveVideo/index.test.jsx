import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { DriveVideo } from './index';

const mocks = vi.hoisted(() => ({ sessions: [], sources: [], unbinds: [], events: [] }));
vi.mock('../../timeline/media', () => ({
  createController: (video, callbacks) => {
    const controller = { update: vi.fn(), dispose: vi.fn(() => mocks.events.push('dispose')), video, callbacks };
    mocks.sessions.push(controller);
    return controller;
  },
  bindMedia: () => { const unbind = vi.fn(); mocks.unbinds.push(unbind); return unbind; },
}));
vi.mock('./transport', () => ({ attachSource: (video, callbacks) => {
  const source = { destroy: vi.fn(() => { mocks.events.push('destroy'); video.pause(); video.removeAttribute('src'); video.load(); }), retry: vi.fn(), reportError: vi.fn(), video, callbacks };
  mocks.sources.push(source);
  return source;
} }));
vi.mock('./VideoStatus', () => ({ default: ({ error, blocked, onRetry, onPlay }) => (
  <div>{error && <button onClick={onRetry}>Retry</button>}{blocked && <button onClick={onPlay}>Play video</button>}</div>
) }));
vi.mock('../../timeline/playback', () => ({
  mediaSource: (sourceToken) => ({ type: 'MEDIA_SOURCE', sourceToken }),
  progress: (sourceToken, seekRevision, offset) => ({ type: 'MEDIA_PROGRESS', sourceToken, seekRevision, offset }),
  seek: (offset) => ({ type: 'ACTION_SEEK', offset }),
  pause: () => ({ type: 'ACTION_PAUSE' }), play: (speed) => ({ type: 'ACTION_PLAY', speed }),
  bufferVideo: (buffering) => ({ type: 'ACTION_BUFFER_VIDEO', buffering }),
}));
vi.mock('../../api/backend', () => ({ api: { video: { getQcameraStreamUrl: (fullname) => `https://video.example/${fullname}` } } }));
const ROUTE = { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', duration: 60000 };
const props = () => ({ currentRoute: ROUTE, desiredPlaySpeed: 1, isMuted: true,
  zoom: { start: 0, end: 60000 }, seekRevision: 1, seekOffset: 0, dispatch: vi.fn((action) => typeof action === 'function' ? action : action), onAudioStatusChange: vi.fn() });
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  mocks.sessions = []; mocks.sources = []; mocks.unbinds = []; mocks.events = []; });

afterEach(() => vi.restoreAllMocks());

test('same element and source survive Map visibility and progress-only updates', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = screen.getByLabelText('Drive video');
  view.rerender(<DriveVideo {...initial} showVideo={false} offset={1000} />);
  expect(screen.getByLabelText('Drive video')).toBe(video);
  expect(mocks.sessions).toHaveLength(1);
  expect(mocks.sources).toHaveLength(1);
  expect(mocks.sessions[0].update).toHaveBeenCalledTimes(1);
});

test('source switch disposes before transport cleanup and rejects old callbacks', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const old = mocks.sessions[0];
  const oldSource = mocks.sources[0];
  const video = screen.getByLabelText('Drive video');
  view.rerender(<DriveVideo {...initial} currentRoute={{ ...ROUTE, fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--13-00-00' }} />);
  expect(mocks.events.slice(0, 2)).toEqual(['dispose', 'destroy']);
  expect(mocks.sessions[0].dispose).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Drive video')).toBe(video);
  initial.dispatch.mockClear();
  initial.onAudioStatusChange.mockClear();
  act(() => {
    old.callbacks.onProgress(12000, 1);
    old.callbacks.onPause();
    oldSource.callbacks.onAudio(true);
    oldSource.callbacks.onStatus({ error: 'Old error', loading: false, blocked: false });
  });
  expect(initial.dispatch).not.toHaveBeenCalled();
  expect(initial.onAudioStatusChange).not.toHaveBeenCalled();
  expect(screen.queryByText('Retry')).not.toBeInTheDocument();
});

test('speed, exact seek and range updates reuse the source', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  view.rerender(<DriveVideo {...initial} desiredPlaySpeed={0.5} seekRevision={2} seekOffset={1}
    loop={{ startTime: 0, duration: 20000 }} />);
  expect(mocks.sources).toHaveLength(1);
  expect(mocks.sessions[0].update).toHaveBeenLastCalledWith(expect.objectContaining({
    speed: 0.5, seekRevision: 2, seekOffset: 1, range: { start: 0, end: 20000 },
  }));
});

test('external pause is intent and blocked playback routes through status while on Map', () => {
  const initial = props();
  render(<DriveVideo {...initial} showVideo={false} />);
  act(() => mocks.sessions[0].callbacks.onPause());
  expect(initial.dispatch).toHaveBeenCalledWith({ type: 'ACTION_PAUSE' });
  act(() => mocks.sessions[0].callbacks.onStatus({ blocked: true }));
  expect(mocks.sources[0].reportError).toHaveBeenCalledWith({ name: 'NotAllowedError' });
  act(() => mocks.sources[0].callbacks.onStatus({ error: 'Failed source', loading: false, blocked: false }));
  expect(screen.getByText('Retry')).toBeVisible();
});

test('unmount rejects stale callbacks and disposes both owners once', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  view.unmount();
  expect(mocks.sessions[0].dispose).toHaveBeenCalledOnce();
  expect(mocks.sources[0].destroy).toHaveBeenCalledOnce();
  initial.dispatch.mockClear();
  mocks.sessions[0].callbacks.onProgress(1000, 1);
  mocks.sessions[0].callbacks.onPause();
  expect(initial.dispatch).not.toHaveBeenCalled();
});


test('Retry preserves actual media position and the same element', () => {
  const initial = props();
  render(<DriveVideo {...initial} />);
  const video = screen.getByLabelText('Drive video');
  video.currentTime = 12.125;
  act(() => mocks.sources[0].callbacks.onStatus({ error: 'Failed source', loading: false, blocked: false }));
  screen.getByText('Retry').click();
  expect(mocks.sources[0].destroy).toHaveBeenCalledOnce();
  expect(mocks.sources).toHaveLength(2);
  expect(initial.dispatch).toHaveBeenCalledWith({ type: 'ACTION_SEEK', offset: 0 });
  expect(screen.getByLabelText('Drive video')).toBe(video);
});

test('clearing the selected route stops and unloads the previous native media', () => {
  const initial = props();
  const view = render(<DriveVideo {...initial} />);
  const video = screen.getByLabelText('Drive video');
  video.src = 'https://video.example/old-route.m3u8';
  const stop = vi.spyOn(video, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(video, 'load').mockImplementation(() => {});
  view.rerender(<DriveVideo {...initial} currentRoute={null} />);
  expect(stop).toHaveBeenCalled();
  expect(video.hasAttribute('src')).toBe(false);
  expect(load).toHaveBeenCalled();
  expect(mocks.sessions[0].dispose).toHaveBeenCalledOnce();
});


test('unknown timing supplies null adapters and Retry retains last explicit target', () => {
  const initial = { ...props(), seekOffset: 10000 };
  render(<DriveVideo {...initial} />);
  const update = mocks.sessions[0].update.mock.calls.at(-1)[0];
  expect(update.toMedia(10000)).toBeNull();
  expect(update.toRoute(10)).toBeNull();
  const video = screen.getByLabelText('Drive video');
  video.currentTime = 30;
  act(() => mocks.sources[0].callbacks.onStatus({ error: 'Failed source', loading: false, blocked: false }));
  screen.getByText('Retry').click();
  expect(initial.dispatch).toHaveBeenCalledWith({ type: 'ACTION_SEEK', offset: 10000 });
});

test('Retry keeps an in-flight explicit target instead of the old native position', () => {
  const initial = { ...props(), seekOffset: 15000, currentRoute: { ...ROUTE,
    segment_numbers: [0], segment_start_times: [0], segment_end_times: [60000] } };
  render(<DriveVideo {...initial} />);
  const video = screen.getByLabelText('Drive video');
  video.currentTime = 10;
  Object.defineProperty(video, 'seeking', { configurable: true, value: true });
  act(() => mocks.sources[0].callbacks.onTimeline([{ number: 0, start: 0, duration: 60 }]));
  initial.dispatch.mockClear();
  act(() => mocks.sources[0].callbacks.onStatus({ error: 'Failed source', loading: false, blocked: false }));
  screen.getByText('Retry').click();
  expect(initial.dispatch).toHaveBeenCalledWith({ type: 'ACTION_SEEK', offset: 15000 });
});
