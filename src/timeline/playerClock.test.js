import { currentOffset, wrapLoop } from '.';
import { registerVideoClock, clearVideoClock, getVideoClock } from './playerClock';

describe('playerClock', () => {
  afterEach(() => {
    clearVideoClock();
  });

  it('returns null when no video reader is registered', () => {
    expect(getVideoClock()).toBeNull();
  });

  it('returns the registered reader value', () => {
    registerVideoClock(() => 4200);
    expect(getVideoClock()).toEqual(4200);
  });

  it('treats NaN / nullish reader output as no clock', () => {
    registerVideoClock(() => NaN);
    expect(getVideoClock()).toBeNull();
    registerVideoClock(() => null);
    expect(getVideoClock()).toBeNull();
  });

  it('clearVideoClock only clears the matching reader', () => {
    const a = () => 1;
    const b = () => 2;
    registerVideoClock(a);
    clearVideoClock(b); // not the active reader -> no-op
    expect(getVideoClock()).toEqual(1);
    clearVideoClock(a);
    expect(getVideoClock()).toBeNull();
  });
});

describe('currentOffset (video-driven)', () => {
  afterEach(() => {
    clearVideoClock();
  });

  it('reads the live video position when a clock is registered', () => {
    registerVideoClock(() => 5000);
    // stored offset is deliberately different to prove the element wins
    expect(currentOffset({ offset: 0, loop: null })).toEqual(5000);
  });

  it('falls back to the stored offset when no video is driving', () => {
    expect(currentOffset({ offset: 2500, loop: null })).toEqual(2500);
  });

  it('does not extrapolate from wall-clock time', () => {
    // no Date.now() term: repeated reads of a static state never advance
    const state = { offset: 1000, startTime: Date.now() - 10000, desiredPlaySpeed: 1, loop: null };
    expect(currentOffset(state)).toEqual(1000);
    expect(currentOffset(state)).toEqual(1000);
  });

  it('clamps the live position into the active loop', () => {
    registerVideoClock(() => 9999);
    expect(currentOffset({ offset: 0, loop: { startTime: 1000, duration: 1000 } })).toEqual(2000);
  });

  it('falls back to loop start when offset is null', () => {
    expect(currentOffset({ offset: null, loop: { startTime: 1500, duration: 1000 } })).toEqual(1500);
  });
});

describe('wrapLoop', () => {
  it('passes through when there is no loop', () => {
    expect(wrapLoop(1234, null)).toEqual(1234);
  });

  it('clamps below the start and above the end', () => {
    const loop = { startTime: 1000, duration: 2000 }; // [1000, 3000]
    expect(wrapLoop(500, loop)).toEqual(1000);
    expect(wrapLoop(5000, loop)).toEqual(3000);
    expect(wrapLoop(2000, loop)).toEqual(2000);
  });
});
