import store from '../store';
import { attachMediaClock, currentOffset } from '.';
import { bufferVideo, observePosition, pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

const initial = () => ({ desiredPlaySpeed: 1, offset: 123, seekRevision: 0,
  isBufferingVideo: false, currentRoute: { fullname: 'route-a', duration: 60000 }, zoom: { start: 0, end: 60000 } });

describe('media-driven playback', () => {
  it('keeps the selected end fixed when camera metadata arrives after selection', () => {
    const state = { ...initial(), loop: { startTime: 0, duration: 10000 }, currentRoute: { fullname: 'route-a', duration: 60000, videoStartOffset: 500 } };
    expect(reducer(state, seek(12000)).offset).toBe(10000);
    expect(reducer(state, seek(0)).offset).toBe(500);
  });
  it('never advances from elapsed wall time', () => {
    vi.useFakeTimers();
    try {
      let state = initial();
      vi.advanceTimersByTime(10000);
      expect(currentOffset(state)).toBe(123);
      state = reducer(state, play(2));
      state = reducer(state, pause());
      expect(state.offset).toBe(123);
    } finally { vi.useRealTimers(); }
  });
  it('distinguishes seek requests from observations', () => {
    let state = reducer(initial(), seek(10000));
    expect(state.seekRevision).toBe(1);
    state = reducer(state, observePosition('route-a', 1, 10033));
    expect(state.offset).toBe(10033);
    expect(state.seekRevision).toBe(1);
  });
  it('rejects old-route and old-seek observations', () => {
    const state = reducer(initial(), seek(20000));
    expect(reducer(state, observePosition('route-b', 1, 0))).toBe(state);
    expect(reducer(state, observePosition('route-a', 0, 1000))).toBe(state);
  });
  it('makes successive requests distinct, including same-position seeks', () => {
    const first = reducer(initial(), seek(10));
    expect(reducer(first, seek(10)).seekRevision).toBe(2);
  });
  it('clamps seeks at both loop boundaries, including a zero start', () => {
    const state = reducer(initial(), selectLoop(0, 2000));
    expect(reducer(state, seek(-1000)).offset).toBe(0);
    expect(reducer(state, seek(3000)).offset).toBe(2000);
  });
  it('clamps seeks at route boundaries without a selected loop', () => {
    expect(reducer(initial(), seek(-1)).offset).toBe(0);
    expect(reducer(initial(), seek(70000)).offset).toBe(60000);
    expect(reducer(initial(), seek(NaN)).offset).toBe(123);
  });
  it('preserves user intent and position during buffering', () => {
    const state = reducer(reducer(initial(), play(.5)), bufferVideo(true));
    expect(state.desiredPlaySpeed).toBe(.5);
    expect(state.offset).toBe(123);
    expect(state.isBufferingVideo).toBe(true);
  });
  it('resets to the selected range or camera origin', () => {
    const state = { ...initial(), zoom: { start: 20000, end: 30000 }, currentRoute: { fullname: 'route-a', videoStartOffset: 25000 } };
    expect(reducer(state, resetPlayback()).offset).toBe(25000);
    expect(reducer(state, resetPlayback()).seekRevision).toBe(1);
  });
  it('avoids loops before camera footage and rejects empty loops', () => {
    const state = { ...initial(), currentRoute: { videoStartOffset: 1000 } };
    expect(reducer(state, selectLoop(0, 3000)).loop).toEqual({ startTime: 1000, duration: 2000 });
    expect(reducer(state, selectLoop(0, 500)).loop).toBeNull();
    expect(reducer(state, selectLoop(null, null)).loop).toBeNull();
  });
});


describe('clock ownership', () => {
  afterEach(() => vi.restoreAllMocks());
  it('works before a route or player exists', () => {
    vi.spyOn(store, 'getState').mockReturnValue({ offset: null, currentRoute: null });
    expect(currentOffset()).toBe(0);
  });
  it('ignores old owners and preserves a newer owner during cleanup', () => {
    vi.spyOn(store, 'getState').mockReturnValue(initial());
    const detachOld = attachMediaClock('route-a', () => 1000);
    const detachNew = attachMediaClock('route-a', () => 2000);
    detachOld();
    expect(currentOffset()).toBe(2000);
    expect(currentOffset(initial())).toBe(123);
    detachNew();
    expect(currentOffset()).toBe(123);
  });
  it('does not read a previous route clock', () => {
    vi.spyOn(store, 'getState').mockReturnValue(initial());
    const detach = attachMediaClock('route-b', () => 9000);
    expect(currentOffset()).toBe(123);
    detach();
  });
});
