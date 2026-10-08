import { currentOffset } from '.';
import { mediaState, pause, play, reducer, seek, selectLoop } from './playback';

const initial = { offset: 0, desiredPlaySpeed: 1, isBufferingVideo: false, currentRoute: { fullname: 'route', duration: 60000 } };

describe('media playback state', () => {
  it('never advances with elapsed wall time, playback speed, or buffering', () => {
    const state = { ...initial, offset: 1234, startTime: Date.now() - 100000 };
    expect(currentOffset(state)).toBe(1234);
    expect(currentOffset(reducer(state, play(8)))).toBe(1234);
    expect(currentOffset(reducer(state, pause()))).toBe(1234);
    expect(currentOffset(reducer(state, mediaState('route', { isBufferingVideo: true })))).toBe(1234);
  });

  it('uses actual video position and rejects updates from a previous route', () => {
    expect(reducer(initial, mediaState('route', { offset: 5000 })).offset).toBe(5000);
    expect(reducer(initial, mediaState('old route', { offset: 5000 }))).toBe(initial);
  });

  it('clamps seeks to selection bounds, including a selection starting at zero', () => {
    const state = reducer(initial, selectLoop(0, 2000));
    expect(reducer(state, seek(-1000)).offset).toBe(0);
    expect(reducer(state, seek(3000)).offset).toBe(2000);
    expect(reducer(state, seek(NaN))).toBe(state);
    const ranged = reducer(initial, selectLoop(1000, 2000));
    expect(reducer(ranged, seek(0)).offset).toBe(1000);
  });
});
