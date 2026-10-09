import { currentOffset, setVideoClock } from '.';
import { pause, play, reducer, resetPlayback, seek, selectLoop, videoProgress } from './playback';

describe('video-driven playback', () => {
  const initial = { desiredPlaySpeed: 1, offset: 0, seekRevision: 0 };

  it('never advances playback using elapsed wall time', () => {
    vi.useFakeTimers();
    const state = reducer(initial, videoProgress(1234));
    vi.advanceTimersByTime(60000);
    expect(currentOffset(state)).toBe(1234);
    expect(currentOffset(reducer(state, pause()))).toBe(1234);
    expect(currentOffset(reducer(state, play(2)))).toBe(1234);
    vi.useRealTimers();
  });

  it('reads actual media time between progress events and releases the clock', () => {
    let offset = 1000;
    const clear = setVideoClock(() => offset);
    expect(currentOffset()).toBe(1000);
    offset = 1500;
    expect(currentOffset()).toBe(1500);
    expect(currentOffset({ offset: 10 })).toBe(10);
    const clearNew = setVideoClock(() => 2000);
    clear();
    expect(currentOffset()).toBe(2000);
    clearNew();
    expect(currentOffset({ offset: null, loop: { startTime: 0 } })).toBe(0);
  });

  it.each([[0, 1000], [3000, 2000], [1500, 1500]])('clamps seek %s to %s', (requested, expected) => {
    const state = reducer(initial, selectLoop(1000, 2000));
    expect(reducer(state, seek(requested)).offset).toBe(expected);
  });

  it('handles loops beginning at zero and rejects empty selections', () => {
    const state = reducer({ ...initial, offset: 15000 }, selectLoop(0, 10000));
    expect(state.offset).toBe(10000);
    expect(reducer(state, seek(-1000)).offset).toBe(0);
    expect(reducer(state, selectLoop(0, 0)).loop).toBeNull();
    expect(reducer(state, selectLoop(2000, 1000)).loop).toBeNull();
  });

  it('only explicit requests change seekRevision, including repeated seeks', () => {
    const requested = reducer(initial, seek(1000));
    const progressed = reducer(requested, videoProgress(1100));
    expect(progressed.seekRevision).toBe(requested.seekRevision);
    expect(reducer(progressed, seek(1100)).seekRevision).toBe(requested.seekRevision + 1);
    expect(reducer(progressed, resetPlayback())).toMatchObject({ offset: null, desiredPlaySpeed: 1 });
  });

  it('rejects invalid seeks and playback rates', () => {
    expect(reducer(initial, seek(NaN))).toBe(initial);
    expect(reducer(initial, play(Infinity))).toBe(initial);
    expect(reducer(initial, play(0))).toBe(initial);
    expect(reducer(initial, play(16)).desiredPlaySpeed).toBe(8);
  });
});
