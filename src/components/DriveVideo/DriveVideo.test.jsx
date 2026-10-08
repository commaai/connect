import React from 'react';
import { Provider } from 'react-redux';
import { act, render } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppStore } from '../../store';
import { createInitialState } from '../../initialState';
import { seek, selectLoop } from '../../timeline/playback';
import DriveVideo from '.';

const mocks = vi.hoisted(() => ({ video: null }));

vi.mock('../../api/backend', () => ({
  api: { video: { getQcameraStreamUrl: () => 'https://example.com/qcamera.m3u8' } },
}));
vi.mock('react-player/file', () => ({
  default: React.forwardRef(({ onReady }, ref) => {
    React.useImperativeHandle(ref, () => ({ getInternalPlayer: () => mocks.video }));
    React.useEffect(() => onReady({ getInternalPlayer: (type) => (type === 'hls' ? null : mocks.video) }), [onReady]);
    return <div data-testid="video-player" />;
  }),
}));

function makeVideo() {
  const video = new EventTarget();
  Object.assign(video, { currentTime: 0, readyState: 4, paused: false, seeking: false });
  return video;
}

function emit(video, type) {
  act(() => { video.dispatchEvent(new Event(type)); });
}

function setup(state = {}) {
  mocks.video = makeVideo();
  const history = createMemoryHistory();
  const store = createAppStore(history, {
    ...createInitialState('/'),
    currentRoute: { fullname: 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00', videoStartOffset: 1000 },
    isBufferingVideo: false,
    ...state,
  });
  render(<Provider store={store}><DriveVideo /></Provider>);
  emit(mocks.video, 'loadedmetadata');
  emit(mocks.video, 'seeked');
  return { store, video: mocks.video };
}

describe('DriveVideo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes the playback position from the video, offset by where the video starts in the route', () => {
    const { store, video } = setup();
    video.currentTime = 5;
    emit(video, 'timeupdate');
    expect(store.getState().offset).toBe(6000);
  });

  it('does not report a position while a seek is in flight', () => {
    const { store, video } = setup();
    video.currentTime = 9;
    emit(video, 'seeking');
    video.currentTime = 3;
    emit(video, 'timeupdate');
    expect(store.getState().offset).not.toBe(4000);
    emit(video, 'seeked');
    expect(store.getState().offset).toBe(4000);
  });

  it('moves the video when the state seeks', () => {
    const { store, video } = setup();
    act(() => { store.dispatch(seek(31000)); });
    expect(video.currentTime).toBeCloseTo(30, 1);
  });

  it('follows the video into a loop wrap', () => {
    const { store, video } = setup();
    act(() => { store.dispatch(selectLoop(2000, 4000)); });
    emit(video, 'seeked'); // the video followed the loop start
    video.currentTime = 6; // 7s into the route, past the loop
    emit(video, 'timeupdate');
    expect(store.getState().offset).toBeGreaterThanOrEqual(2000);
    expect(store.getState().offset).toBeLessThan(4000);
    expect(video.currentTime).toBeCloseTo((store.getState().offset - 1000) / 1000);
  });

  it('shows the spinner state from the video, not from a timer', () => {
    const { store, video } = setup();
    video.readyState = 1;
    emit(video, 'waiting');
    expect(store.getState().isBufferingVideo).toBe(true);
    video.readyState = 4;
    emit(video, 'playing');
    expect(store.getState().isBufferingVideo).toBe(false);
  });

  it('pauses the state when the browser pauses a loaded video', () => {
    const { store, video } = setup();
    video.paused = true;
    emit(video, 'pause');
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('ignores the pause a video gets while its source loads', () => {
    const { store, video } = setup();
    video.paused = true;
    video.readyState = 1;
    emit(video, 'pause');
    expect(store.getState().desiredPlaySpeed).toBe(1);
  });
});
