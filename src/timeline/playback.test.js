import * as Redux from 'redux';
import thunk from 'redux-thunk';
import { vi } from 'vitest';

import { currentOffset } from '.';
import { bufferVideo, pause, play, playRange, reducer, seek, videoPaused } from './playback';
import { attachPlayer, detachPlayer } from './player';

function createStore() {
  return Redux.createStore(reducer, {
    desiredPlaySpeed: 0, offset: 0, startTime: Date.now(), isBufferingVideo: false, loop: null,
  }, Redux.applyMiddleware(thunk));
}

function fakeVideo() {
  return {
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    play: vi.fn(async function playVideo() { this.paused = false; }),
    pause: vi.fn(function pauseVideo() { this.paused = true; }),
  };
}

describe('playback without a video', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('extrapolates the offset from the play speed', () => {
    const store = createStore();
    store.dispatch(play());
    vi.advanceTimersByTime(1000);
    expect(currentOffset(store.getState())).toBe(1000);

    store.dispatch(play(0.5));
    vi.advanceTimersByTime(1000);
    expect(currentOffset(store.getState())).toBe(1500);

    store.dispatch(pause());
    vi.advanceTimersByTime(1000);
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 0, offset: 1500 });
    expect(currentOffset(store.getState())).toBe(1500);
  });

  it('does not advance while buffering', () => {
    const store = createStore();
    store.dispatch(play());
    store.dispatch(bufferVideo(true));
    vi.advanceTimersByTime(1000);
    expect(currentOffset(store.getState())).toBe(0);
    store.dispatch(bufferVideo(false));
    vi.advanceTimersByTime(1000);
    expect(currentOffset(store.getState())).toBe(1000);
  });

  it.each([[3000, 2000], [0, 1000], [1500, 1500]])('clamps a seek to %i into the loop', (offset, expected) => {
    const store = createStore();
    store.dispatch(playRange(1000, 2000));
    store.dispatch(seek(offset));
    expect(store.getState().offset).toBe(expected);
  });

  it('wraps around the loop', () => {
    const store = createStore();
    store.dispatch(playRange(1000, 2000));
    vi.advanceTimersByTime(1500);
    expect(currentOffset(store.getState())).toBe(1500);
  });
});

describe('playback with a video', () => {
  let video;
  beforeEach(() => {
    video = fakeVideo();
    attachPlayer(video, null, 2000);
  });
  afterEach(() => detachPlayer(video));

  it('reads the offset from the video', () => {
    video.currentTime = 10;
    expect(currentOffset()).toBe(12000);
  });

  it('commands the video', async () => {
    const store = createStore();
    store.dispatch(seek(7000));
    expect(video.currentTime).toBe(5);

    store.dispatch(play(2));
    expect(video.playbackRate).toBe(2);
    expect(video.play).toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 2, offset: 7000 });

    store.dispatch(pause());
    expect(video.pause).toHaveBeenCalled();
    expect(store.getState().desiredPlaySpeed).toBe(0);
  });

  it('shows the video as paused when autoplay is blocked', async () => {
    video.play.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const store = createStore();
    store.dispatch(play());
    await vi.waitFor(() => expect(store.getState().desiredPlaySpeed).toBe(0));
  });

  it('plays a range from its start', () => {
    const store = createStore();
    store.dispatch(playRange(60000, 120000));
    expect(store.getState().loop).toEqual({ startTime: 60000, duration: 60000 });
    expect(video.currentTime).toBe(58);
    expect(video.play).toHaveBeenCalled();
  });

  it('records a pause by the video', () => {
    const store = createStore();
    store.dispatch(play());
    store.dispatch(videoPaused(4000));
    expect(store.getState()).toMatchObject({ desiredPlaySpeed: 0, offset: 4000 });
    expect(video.pause).not.toHaveBeenCalled();
  });
});
