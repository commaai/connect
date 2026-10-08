import { currentOffset, setPlayer } from '.';
import { bufferVideo, pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

const initial = () => ({ desiredPlaySpeed: 1, offset: null, seekId: 0, isBufferingVideo: true, loop: null });

describe('playback', () => {
  afterEach(() => setPlayer(null));

  it('remembers the speed the user asked for', () => {
    let state = reducer(initial(), pause());
    expect(state.desiredPlaySpeed).toEqual(0);
    state = reducer(state, play(0.5));
    expect(state.desiredPlaySpeed).toEqual(0.5);
    state = reducer(state, play());
    expect(state.desiredPlaySpeed).toEqual(1);
  });

  it('counts every seek, also to the same offset', () => {
    let state = reducer(initial(), seek(123));
    expect(state).toMatchObject({ offset: 123, seekId: 1 });
    state = reducer(state, seek(123));
    expect(state).toMatchObject({ offset: 123, seekId: 2 });
  });

  it.each([
    ['before', 0, 1000],
    ['inside', 1500, 1500],
    ['after', 3000, 2000],
  ])('keeps a seek %s the loop inside it', (_name, offset, expected) => {
    const state = reducer(reducer(initial(), selectLoop(1000, 2000)), seek(offset));
    expect(state.loop).toEqual({ startTime: 1000, duration: 1000 });
    expect(state.offset).toEqual(expected);
  });

  it('starts a new loop at its beginning', () => {
    let state = reducer(reducer(initial(), seek(100)), resetPlayback());
    state = reducer(state, selectLoop(1000, 2000));
    expect(state).toMatchObject({ offset: 1000, seekId: 2, desiredPlaySpeed: 1, isBufferingVideo: true });
  });

  it('clears the loop', () => {
    const state = reducer(reducer(initial(), selectLoop(1000, 2000)), selectLoop(null, null));
    expect(state.loop).toBeNull();
  });

  it('starts the whole drive where its video starts', () => {
    const state = reducer({
      ...initial(), currentRoute: { videoStartOffset: 400 }, zoom: { start: 0, end: 60000 },
    }, selectLoop(0, 60000));
    expect(state.loop).toEqual({ startTime: 400, duration: 59600 });
  });

  it('tracks buffering', () => {
    let state = reducer(initial(), bufferVideo(false));
    expect(state.isBufferingVideo).toEqual(false);
    state = reducer(state, bufferVideo(true));
    expect(state.isBufferingVideo).toEqual(true);
  });

  it('takes its time from the video once there is one', () => {
    const state = { ...initial(), offset: 5000, currentRoute: { videoStartOffset: 400 } };
    expect(currentOffset(state)).toEqual(5000);
    setPlayer({ getDuration: () => 60, getCurrentTime: () => 12 });
    expect(currentOffset(state)).toEqual(12400);
  });

  it('waits at the start of the loop before any seek', () => {
    expect(currentOffset({ ...initial(), loop: { startTime: 1000, duration: 1000 } })).toEqual(1000);
  });
});
