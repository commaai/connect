import { vi } from 'vitest';

import { attachVideo, currentOffset, detachVideo } from '.';
import { pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

vi.mock('../store', () => ({ default: { getState: () => ({}) } }));

// a <video> that has loaded its metadata
function fakeVideo(currentTime = 0) {
  return { readyState: HTMLMediaElement.HAVE_METADATA, currentTime };
}

function run(state, thunk) {
  let next = state;
  thunk((action) => { next = reducer(next, action); }, () => next);
  return next;
}

const route = { videoStartOffset: 2000 };
let video;

beforeEach(() => {
  video = fakeVideo();
  attachVideo(video);
});

afterEach(() => {
  detachVideo(video);
});

describe('playback controls', () => {
  it('pause, play and speed only record what the user asked for', () => {
    let state = { desiredPlaySpeed: 1 };
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toBe(0);
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toBe(0.5);
    state = reducer(state, resetPlayback());
    expect(state).toEqual({ desiredPlaySpeed: 1, offset: null });
  });

  it('selects and clears a loop', () => {
    let state = reducer({}, selectLoop(1000, 3000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 2000 });
    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });
});

describe('the video is the clock', () => {
  it('reads the position from the video, after the drive\'s video start offset', () => {
    video.currentTime = 12.5;
    expect(currentOffset({ currentRoute: route })).toBe(14500);
  });

  it('seeks the video, measured from where its video starts', () => {
    const state = run({ currentRoute: route }, seek(10000));
    expect(state.offset).toBe(10000);
    expect(video.currentTime).toBe(8);
  });

  it('seeks to the start of the video for offsets before it', () => {
    run({ currentRoute: route }, seek(500));
    expect(video.currentTime).toBe(0);
  });

  it.each([
    ['after', 3000, 2000],
    ['before', 0, 1000],
  ])('clamps a seek %s the loop into it', (_name, offset, expected) => {
    const state = run({ loop: { startTime: 1000, duration: 1000 } }, seek(offset));
    expect(state.offset).toBe(expected);
    expect(video.currentTime).toBe(expected / 1000);
  });

  it('without a loaded video, is wherever playback will start', () => {
    video.readyState = HTMLMediaElement.HAVE_NOTHING;
    expect(currentOffset({ offset: 4000, loop: { startTime: 1000 } })).toBe(4000);
    expect(currentOffset({ offset: null, loop: { startTime: 1000 } })).toBe(1000);
    expect(currentOffset({ offset: null, loop: null })).toBe(0);

    const state = run({}, seek(4000));
    expect(state.offset).toBe(4000);
    expect(video.currentTime).toBe(0); // picked up from state once the video loads
  });
});
