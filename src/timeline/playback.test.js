import { asyncSleep } from '../utils';
import { currentOffset, setVideoClock } from '.';
import { pause, play, reducer, seek, selectLoop } from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1, // 0 = stopped, 1 = playing, 2 = 2x speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now(), // millisecond timestamp in which play began
  };
};

// make Date.now super stable for tests
let mostRecentNow = Date.now();
const oldNow = Date.now;
Date.now = function now() {
  return mostRecentNow;
};
function newNow() {
  mostRecentNow = oldNow();
  return mostRecentNow;
}

describe('playback', () => {
  it('has playback controls', async () => {
    newNow();
    let state = makeDefaultStruct();

    // should do nothing
    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    // start playing, should set start time and such
    let playTime = newNow();
    state = reducer(state, play());
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(1);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset
    let ellapsed = newNow() - playTime;
    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    // start playing, should set start time and such
    playTime = newNow();
    state = reducer(state, play(0.5));
    // this is a (usually 1ms) race condition
    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    await asyncSleep(100 + Math.random() * 200);
    // should update offset, playback speed 1/2
    ellapsed += (newNow() - playTime) / 2;
    expect(currentOffset(state)).toEqual(ellapsed);
    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    // seek!
    newNow();
    state = reducer(state, seek(123));
    expect(state.offset).toEqual(123);
    expect(state.startTime).toEqual(Date.now());
    expect(currentOffset(state)).toEqual(123);
  });

  it('should clamp loop when seeked after loop end time', () => {
    newNow();
    let state = makeDefaultStruct();

    // set up loop
    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek past loop end boundary a
    state = reducer(state, seek(3000));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    newNow();
    let state = makeDefaultStruct();

    // set up loop
    state = reducer(state, play());
    state = reducer(state, selectLoop(
      1000,
      2000,
    ));
    expect(state.loop.startTime).toEqual(1000);

    // seek past loop end boundary a
    state = reducer(state, seek(0));
    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  describe('video clock', () => {
    const route = { fullname: 'a2a0ccea32023010|2023-07-27--13-01-19' };

    afterEach(() => {
      setVideoClock(null);
    });

    it('reads the offset from the video of the current route', () => {
      newNow();
      const state = { ...makeDefaultStruct(), currentRoute: route };
      setVideoClock({ route: route.fullname, getOffset: () => 4321 });
      expect(currentOffset(state)).toEqual(4321);
    });

    it('ignores a video from another route', () => {
      newNow();
      const state = { ...makeDefaultStruct(), offset: 1000, currentRoute: route };
      setVideoClock({ route: 'other|route', getOffset: () => 4321 });
      expect(currentOffset(state)).toEqual(1000);
    });

    it('uses the video position for play and pause', () => {
      newNow();
      let state = { ...makeDefaultStruct(), offset: 1000, currentRoute: route };
      setVideoClock({ route: route.fullname, getOffset: () => 4321 });
      state = reducer(state, pause());
      expect(state.offset).toEqual(4321);
      state = reducer(state, play());
      expect(state.offset).toEqual(4321);
    });

    it('wraps a video that played past the loop end', () => {
      newNow();
      let state = { ...makeDefaultStruct(), currentRoute: route };
      state = reducer(state, selectLoop(1000, 2000));
      setVideoClock({ route: route.fullname, getOffset: () => 2500 });
      state = reducer(state, play(2));
      expect(state.offset).toEqual(1500);
    });

    it('falls back to the wall clock without a video', () => {
      newNow();
      const state = { ...makeDefaultStruct(), offset: 1000, desiredPlaySpeed: 0, currentRoute: route };
      setVideoClock(null);
      expect(currentOffset(state)).toEqual(1000);
    });
  });
});
