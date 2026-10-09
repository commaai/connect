import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, seek, seekBy, seekDone, selectLoop, videoTime } from './playback';

const fullname = 'aaaaaaaaaaaaaaaa|2026-08-06--12-00-00';
const makeState = () => ({ currentRoute: { fullname, duration: 60000 }, desiredPlaySpeed: 1, offset: 1200,
  isBufferingVideo: false, loop: { startTime: 0, duration: 60000 }, seekRequest: null });

it('does not invent elapsed time while media is playing, paused, buffering or hidden', () => {
  vi.useFakeTimers();
  const state = makeState();
  vi.advanceTimersByTime(60000);
  expect(currentOffset(state)).toBe(1200);
  expect(currentOffset(reducer(state, pause()))).toBe(1200);
  expect(currentOffset(reducer(state, bufferVideo(true)))).toBe(1200);
  vi.useRealTimers();
});

it('only the current route media can publish observed time', () => {
  const state = makeState();
  expect(reducer(state, videoTime('another-route', 2000))).toBe(state);
  expect(reducer(state, videoTime(fullname, NaN))).toBe(state);
  expect(reducer(state, videoTime(fullname, 1234.5)).offset).toBe(1234.5);
});

it('separates rapid seek commands from observed time and clamps zero-based bounds', () => {
  let state = reducer(makeState(), seek(-100));
  expect(state.offset).toBe(1200);
  expect(state.seekRequest).toEqual({ id: 1, fullname, offset: 0 });
  state = reducer(state, seek(100000));
  expect(state.seekRequest).toEqual({ id: 2, fullname, offset: 60000 });
  expect(state.offset).toBe(1200);
});

it('clamps seeks to a selected range and ignores invalid commands', () => {
  const state = { ...makeState(), loop: { startTime: 10000, duration: 20000 } };
  expect(reducer(state, seek(0)).seekRequest.offset).toBe(10000);
  expect(reducer(state, seek(Infinity))).toBe(state);
  expect(reducer(state, play(NaN))).toBe(state);
  expect(reducer(state, play(-1))).toBe(state);
});

it('play, pause, rates and buffering do not move the media clock', () => {
  let state = reducer(makeState(), pause());
  expect(state.desiredPlaySpeed).toBe(0);
  state = reducer(state, play(0.5));
  state = reducer(state, bufferVideo(true));
  expect(state).toMatchObject({ desiredPlaySpeed: 0.5, offset: 1200, isBufferingVideo: true });
  expect(reducer(state, play(100)).desiredPlaySpeed).toBe(16);
  expect(reducer(state, play(0.01)).desiredPlaySpeed).toBe(0.1);
});

it('resets commands and observed position for new playback without a second clock', () => {
  const state = reducer(reducer(makeState(), seek(2000)), resetPlayback());
  expect(state).toMatchObject({ offset: null, seekRequest: null, desiredPlaySpeed: 1, isBufferingVideo: true });
  expect(currentOffset(state)).toBe(0);
  expect(currentOffset(reducer(state, selectLoop(10000, 20000)))).toBe(10000);
  expect(reducer(state, selectLoop(null, null)).loop).toBeNull();
});


it('accumulates relative commands until the current seek completes, then uses observed time', () => {
  let state = makeState();
  const dispatch = action => { state = reducer(state, action); };
  seekBy(10000)(dispatch, () => state);
  const old = state.seekRequest;
  seekBy(10000)(dispatch, () => state);
  expect(state.seekRequest.offset).toBe(21200);
  expect(state.offset).toBe(1200);
  dispatch(seekDone(old));
  expect(state.seekRequest.offset).toBe(21200);
  const current = state.seekRequest;
  dispatch(videoTime(fullname, 21200)); dispatch(seekDone(current));
  dispatch(videoTime(fullname, 22000)); seekBy(-10000)(dispatch, () => state);
  expect(state.seekRequest.offset).toBe(12000);
});
