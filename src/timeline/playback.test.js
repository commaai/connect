import { vi } from 'vitest';
import { applyPendingSeek, currentOffset, seekTo, setVideo, setVideoFailed, setVideoSegments, toVideoTime } from '.';
import { pause, play, reducer, seek, videoState } from './playback';
import * as Types from '../actions/types';

const { HAVE_NOTHING, HAVE_METADATA, HAVE_CURRENT_DATA, HAVE_ENOUGH_DATA } = HTMLMediaElement;

function makeVideo(props = {}) {
  return {
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    readyState: HAVE_ENOUGH_DATA,
    seeking: false,
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    ...props,
  };
}

const state = {
  currentRoute: { videoStartOffset: 500 },
  zoom: { start: 10000, end: 20000 },
};

afterEach(() => setVideo(null));

describe('playback clock', () => {
  it('reads the playhead from the video', () => {
    setVideo(makeVideo({ currentTime: 12 }));
    expect(currentOffset(state)).toEqual(12500);
  });

  it('starts at the selected range before there is a video', () => {
    expect(currentOffset(state)).toEqual(10000);
  });

  it('seeks within the selected range', () => {
    const video = makeVideo();
    setVideo(video);
    seekTo(15500, state);
    expect(video.currentTime).toEqual(15);
    seekTo(25000, state);
    expect(currentOffset(state)).toEqual(20000);
    seekTo(0, state);
    expect(currentOffset(state)).toEqual(10000);
  });

  it('stops a seek past the end of the video on its last frame', () => {
    const video = makeVideo({ duration: 180, paused: false });
    setVideo(video);
    seekTo(400500, { ...state, zoom: null });
    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBeCloseTo(179.95);
  });

  it('holds a seek until the video has metadata', () => {
    const video = makeVideo({ readyState: HAVE_NOTHING, currentTime: 0 });
    setVideo(video);
    seekTo(30000, { zoom: null });
    expect(currentOffset(state)).toEqual(30000);
    expect(video.currentTime).toEqual(0);

    video.readyState = HAVE_METADATA;
    applyPendingSeek();
    expect(video.currentTime).toEqual(30);
  });

  it('skips the drive time of segments missing from the video', () => {
    setVideoSegments([{ number: 0, start: 0 }, { number: 1, start: 60 }, { number: 3, start: 120 }, { number: 4, start: 180 }]);
    setVideo(makeVideo({ currentTime: 130 }));
    expect(currentOffset(state)).toEqual(190500);
    expect(toVideoTime(190500, state)).toEqual(130);
    expect(toVideoTime(30500, state)).toEqual(30);
    // an offset in the missing segment shows the video that follows it
    expect(toVideoTime(150500, state)).toEqual(120);
  });
});

describe('playback commands', () => {
  it('apply to the video and report the user action', () => {
    const video = makeVideo();
    const dispatch = vi.fn();
    setVideo(video);

    play(2)(dispatch);
    expect(video.playbackRate).toEqual(2);
    expect(video.play).toHaveBeenCalled();
    expect(dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_PLAY, offset: 0, speed: 2 });

    pause()(dispatch);
    expect(video.pause).toHaveBeenCalled();

    seek(4000)(dispatch);
    expect(video.currentTime).toEqual(4);
    expect(dispatch).toHaveBeenLastCalledWith({ type: Types.ACTION_SEEK, offset: 4000 });
  });

  it('only change state through what the video reports', () => {
    const before = { isPaused: true, playSpeed: 1, isBufferingVideo: false };
    expect(reducer(before, { type: Types.ACTION_PLAY, speed: 2 })).toBe(before);

    const playing = reducer(before, videoState(makeVideo({ paused: false, playbackRate: 2 })));
    expect(playing).toEqual({ isPaused: false, playSpeed: 2, isBufferingVideo: false });
  });
});

describe('clock for a failed video', () => {
  let now = 0;
  beforeEach(() => vi.stubGlobal('performance', { now: () => now }));
  afterEach(() => vi.unstubAllGlobals());

  it('moves the playhead while playing and loops in the range', () => {
    const video = makeVideo({ readyState: HAVE_NOTHING });
    const dispatch = vi.fn();
    setVideo(video);
    seekTo(12000, state);
    setVideoFailed(true);
    now += 1000;
    expect(currentOffset(state)).toEqual(12000);

    play(2)(dispatch);
    expect(video.play).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ isPaused: false, playSpeed: 2 }));
    now += 3000;
    expect(currentOffset(state)).toEqual(18000);
    now += 2000;
    expect(currentOffset(state)).toEqual(12000);

    pause()(dispatch);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ isPaused: true }));
    now += 1000;
    expect(currentOffset(state)).toEqual(12000);

    seek(15000)(dispatch);
    expect(currentOffset(state)).toEqual(15000);
    setVideoFailed(false);
    expect(currentOffset(state)).toEqual(15000);
  });
});

describe('video state', () => {
  it.each([
    ['paused with a frame', { paused: true, readyState: HAVE_CURRENT_DATA }, false],
    ['playing with data ahead', { paused: false, readyState: HAVE_ENOUGH_DATA }, false],
    ['playing without data ahead', { paused: false, readyState: HAVE_CURRENT_DATA }, true],
    ['without a frame', { paused: true, readyState: HAVE_METADATA }, true],
    ['seeking', { paused: true, seeking: true }, true],
  ])('is buffering when %s: %s', (_name, props, buffering) => {
    expect(videoState(makeVideo(props)).isBufferingVideo).toEqual(buffering);
  });
});
