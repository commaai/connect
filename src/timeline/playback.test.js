import { currentOffset } from '.';
import { bufferVideo, pause, play, reducer, seek, selectLoop, videoProgress, resetPlayback } from './playback';

const initial = () => ({ desiredPlaySpeed: 1, offset: 0, seekRevision: 0, currentRoute: { fullname: 'route' } });

describe('media-owned playback', () => {
  it('only advances from media observations, regardless of elapsed wall time or speed', () => {
    let state = reducer(initial(), play(2));
    expect(currentOffset({ ...state, startTime: Date.now() - 10000 })).toBe(0);
    state = reducer(state, videoProgress('route', 1234, 0));
    expect(currentOffset(state)).toBe(1234);
    state = reducer(state, pause());
    state = reducer(state, bufferVideo(true));
    expect(state.offset).toBe(1234);
    expect(state.desiredPlaySpeed).toBe(0);
  });

  it('leaves the position to the media when pausing, playing or buffering', () => {
    const state = { ...initial(), offset: null, loop: { startTime: 5000, duration: 1000 } };
    for (const action of [pause(), play(2), bufferVideo(false)]) {
      expect(reducer(state, action)).toMatchObject({ offset: null, seekRevision: 0 });
    }
  });

  it('separates rapid explicit seeks from observations and rejects stale updates', () => {
    let state = reducer(initial(), seek(1000));
    state = reducer(state, seek(5000));
    expect(state.seekRevision).toBe(2);
    expect(reducer(state, videoProgress('route', 1000, 1)).offset).toBe(5000);
    expect(reducer(state, videoProgress('previous route', 1000, 2)).offset).toBe(5000);
    state = reducer(state, videoProgress('route', 5001, 2));
    expect(state.offset).toBe(5001);
    expect(state.seekRevision).toBe(2);
  });

  it('clamps seeks to loops that start at zero', () => {
    let state = reducer(initial(), selectLoop(0, 2000));
    expect(reducer(state, seek(-100)).offset).toBe(0);
    expect(reducer(state, seek(3000)).offset).toBe(2000);
    expect(currentOffset({ ...state, offset: null })).toBe(0);
  });

  it('preserves clipped video loop boundaries', () => {
    const state = reducer({ ...initial(), currentRoute: { fullname: 'route', videoStartOffset: 1500 }, zoom: { start: 0 } }, selectLoop(0, 5000));
    expect(state.loop).toEqual({ startTime: 1500, duration: 3500 });
  });

  it('reset issues a fresh seek and preserves buffering intent', () => {
    const state = reducer(reducer(initial(), seek(1000)), resetPlayback());
    expect(state.offset).toBe(0);
    expect(state.seekRevision).toBe(2);
    expect(state.isBufferingVideo).toBe(true);
  });

  it('starts a newly selected nonzero clip at its first frame', () => {
    const reset = reducer(initial(), resetPlayback());
    const state = reducer(reset, selectLoop(10000, 20000));
    expect(currentOffset(state)).toBe(10000);
    expect(state.seekRevision).toBe(reset.seekRevision + 1);
    expect(reducer(state, videoProgress('route', 0, reset.seekRevision)).offset).toBe(10000);
  });

  it('keeps the current frame when enlarging a clip around it', () => {
    const state = reducer({ ...initial(), offset: 15000 }, selectLoop(10000, 20000));
    expect(state.offset).toBe(15000);
    expect(state.seekRevision).toBe(0);
  });

  it('seeks to late first-frame metadata', () => {
    const state = reducer({ ...initial(), currentRoute: { fullname: 'route', videoStartOffset: 1500 },
      zoom: { start: 0 }, loop: { startTime: 0, duration: 5000 } }, { type: 'METADATA' });
    expect(state.offset).toBe(1500);
    expect(state.seekRevision).toBe(1);
    expect(state.loop).toEqual({ startTime: 1500, duration: 3500 });
  });
});
