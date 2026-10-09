import {
  pause, play, reducer, resetPlayback, seek, seekBy, selectLoop, setPlaybackSpeed, videoProgress, VideoStatus,
} from './playback';

const run = (state, ...actions) => actions.reduce(reducer, state);

describe('playback', () => {
  const initial = { offset: 0, seekRequest: null, desiredPlaySpeed: 1, isPlaying: true, loop: null };

  it('asks the video to seek, and only records its progress', () => {
    const first = run(initial, seek(5000));
    expect(first).toMatchObject({ offset: 5000, seekRequest: { offset: 5000 } });
    expect(run(first, seek(5000)).seekRequest).not.toBe(first.seekRequest);

    const progressed = run(first, videoProgress(5250));
    expect(progressed.offset).toBe(5250);
    expect(progressed.seekRequest).toBe(first.seekRequest);
  });

  it('clamps seeks to the selected range', () => {
    const looped = run(initial, selectLoop(1000, 2000));
    expect(run(looped, seek(3000)).offset).toBe(2000);
    expect(run(looped, seek(0)).offset).toBe(1000);
    expect(run(looped, selectLoop(null, null)).loop).toBe(null);
  });

  it('keeps the play state and speed separate', () => {
    const state = run(initial, setPlaybackSpeed(4), pause());
    expect(state).toMatchObject({ isPlaying: false, desiredPlaySpeed: 4 });
    expect(run(state, play())).toMatchObject({ isPlaying: true, desiredPlaySpeed: 4 });
  });

  it('starts a route from the beginning of its range', () => {
    const state = run(
      { ...initial, hasAudio: true, videoStatus: VideoStatus.FAILED },
      selectLoop(3000, 9000), seek(5000), setPlaybackSpeed(2), pause(), resetPlayback(),
    );
    expect(state).toMatchObject({
      offset: 3000, seekRequest: null, desiredPlaySpeed: 1, isPlaying: true, hasAudio: false, videoStatus: VideoStatus.LOADING,
    });
  });

  it('seeks relative to the current position', () => {
    let state = run(initial, videoProgress(12000));
    seekBy(-10000)((action) => { state = reducer(state, action); }, () => state);
    expect(state.seekRequest).toEqual({ offset: 2000 });
  });
});
