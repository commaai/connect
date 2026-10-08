import { attachVideo, currentOffset } from '.';
import { pause, play, reducer, seek, selectLoop } from './playback';

function runSeek(state, offset) {
  let action;
  seek(offset)((a) => { action = a; }, () => state);
  return reducer(state, action);
}

describe('playback', () => {
  afterEach(() => attachVideo(null));

  it('has playback controls', () => {
    let state = { desiredPlaySpeed: 1, offset: null, loop: null };

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);

    state = runSeek(state, 123);
    expect(state.offset).toEqual(123);
    expect(currentOffset(state)).toEqual(123);
  });

  it('clamps seeks to the loop', () => {
    let state = reducer({ offset: null }, selectLoop(1000, 2000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 1000 });
    expect(currentOffset(state)).toEqual(1000);

    expect(runSeek(state, 3000).offset).toEqual(2000);
    expect(runSeek(state, 0).offset).toEqual(1000);

    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('follows the video once attached', () => {
    const video = { currentTime: 0 };
    const state = {
      offset: 0,
      loop: { startTime: 0, duration: 60000 },
      currentRoute: { videoStartOffset: 2000 },
    };
    attachVideo(video);

    expect(runSeek(state, 12000).offset).toEqual(12000);
    expect(video.currentTime).toEqual(10);

    video.currentTime = 30;
    expect(currentOffset(state)).toEqual(32000);

    // logs that start before the video seek to its first frame
    runSeek(state, 500);
    expect(video.currentTime).toEqual(0);
  });
});
