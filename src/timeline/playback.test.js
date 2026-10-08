import { publicRoute } from '../../config/vitest/publicRoute';
import { currentOffset } from '.';
import { mediaState, pause, play, reducer, resetPlayback, seek, selectLoop } from './playback';

const initial = () => ({
  currentRoute: publicRoute,
  desiredPlaySpeed: 1,
  playRequest: 0,
  offset: null,
  isPlaying: false,
  isBufferingVideo: true,
  seekRequest: { offset: null, id: 0 },
});

describe('media-led playback', () => {
  it('commands do not advance observed position or status', () => {
    let state = reducer(initial(), mediaState(publicRoute.fullname, { offset: 60000, isPlaying: true }));
    state = reducer(state, pause());
    expect(state.offset).toBe(60000);
    expect(state.isPlaying).toBe(true);
    state = reducer(state, play(2));
    state = reducer(state, seek(120000));
    expect(state.seekRequest).toEqual({ offset: 120000, id: 1, route: publicRoute.fullname });
    expect(currentOffset(state)).toBe(60000);
    expect(state.isPlaying).toBe(true);
  });

  it('observes pauses, buffering, and actual position without a wall clock', () => {
    const state = reducer(initial(), mediaState(publicRoute.fullname, {
      offset: 120000, isPlaying: false, isBufferingVideo: true,
    }));
    vi.useFakeTimers();
    vi.advanceTimersByTime(publicRoute.duration);
    expect(currentOffset(state)).toBe(120000);
    vi.useRealTimers();
  });

  it('clamps requested seeks to the selected range, including its zero start', () => {
    let state = reducer(initial(), selectLoop(0, 60000));
    state = reducer(state, seek(-10000));
    expect(state.seekRequest.offset).toBe(0);
    state = reducer(state, seek(120000));
    expect(state.seekRequest.offset).toBe(60000);
    state = reducer(state, selectLoop(60000, 120000));
    expect(state.seekRequest.offset).toBe(60000);
    expect(state.offset).toBeNull();
  });

  it('rejects non-finite seek inputs and clamps whole-route seeks to real duration', () => {
    const state = initial();
    expect(reducer(state, seek(NaN))).toBe(state);
    expect(reducer(state, seek(Infinity))).toBe(state);
    expect(reducer(state, seek(publicRoute.duration + 10000)).seekRequest.offset).toBe(publicRoute.duration);
  });

  it('ignores an old route publication after closing the drive', () => {
    const state = { ...initial(), currentRoute: null };
    expect(reducer(state, mediaState(publicRoute.fullname, { offset: 120000, isPlaying: true }))).toBe(state);
  });

  it('reissues same-speed commands and resets without inventing an actual position', () => {
    let state = reducer(initial(), play());
    const request = state.playRequest;
    state = reducer(state, play());
    expect(state.playRequest).toBe(request + 1);
    state = reducer(state, resetPlayback());
    expect(state.offset).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.seekRequest.offset).toBeNull();
  });
});
