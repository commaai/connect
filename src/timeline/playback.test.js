import { currentOffset } from '.';
import { pause, play, setPlaySpeed, reducer, resetPlayback, seek, selectLoop, videoPosition } from './playback';

const initial = () => ({
  currentRoute: { fullname: 'route', duration: 60000, videoStartOffset: 0 },
  desiredPlaySpeed: 1, offset: 1000, seekOffset: null, seekRevision: 0, isPlaying: true,
});

describe('media-driven playback', () => {
  it('never advances the position using elapsed wall-clock time', () => {
    const state = initial();
    vi.spyOn(Date, 'now').mockReturnValue(999999999);
    expect(currentOffset(state)).toBe(1000);
    expect(currentOffset(reducer(state, play(2)))).toBe(1000);
    expect(currentOffset(reducer(state, pause()))).toBe(1000);
    vi.restoreAllMocks();
  });

  it('publishes observed media position without issuing another seek', () => {
    const state = reducer(initial(), videoPosition('route', 2345));
    expect(state.offset).toBe(2345);
    expect(state.seekRevision).toBe(0);
    expect(state.seekOffset).toBeNull();
  });

  it('keeps only the latest seek request, separate from confirmed position', () => {
    let state = reducer(initial(), seek(2000));
    state = reducer(state, seek(3000));
    expect(state).toMatchObject({ offset: 1000, seekOffset: 3000, seekRevision: 2 });
    expect(reducer(state, videoPosition('route', 2000, 1))).toBe(state);
    expect(reducer(state, videoPosition('route', 3000, 2)).offset).toBe(3000);
  });

  it('rejects stale routes and invalid positions', () => {
    const state = initial();
    expect(reducer(state, videoPosition('old-route', 3000))).toBe(state);
    expect(reducer(state, videoPosition('route', NaN))).toBe(state);
    expect(reducer(state, seek(Infinity))).toBe(state);
  });

  it('clamps seeks to route and loop bounds, including loops starting at zero', () => {
    let state = reducer(initial(), selectLoop(0, 2000));
    expect(reducer(state, seek(-100)).seekOffset).toBe(0);
    expect(reducer(state, seek(3000)).seekOffset).toBe(2000);
    state = reducer(state, selectLoop(1000, 2000));
    expect(reducer(state, seek(0)).seekOffset).toBe(1000);
    state = reducer(initial(), seek(999999));
    expect(state.seekOffset).toBe(60000);
  });

  it('resets to the selected range and respects delayed video start', () => {
    const state = { ...initial(), currentRoute: { ...initial().currentRoute, videoStartOffset: 5000 }, zoom: { start: 10000 } };
    expect(reducer(state, resetPlayback())).toMatchObject({ offset: null, seekOffset: 10000, isPlaying: true });
    expect(reducer(state, seek(0)).seekOffset).toBe(5000);
    expect(currentOffset({ offset: null, loop: { startTime: 0, duration: 2000 } })).toBe(0);
  });

  it('rejects empty loops and invalid speeds', () => {
    expect(reducer(initial(), selectLoop(1000, 1000)).loop).toBeNull();
    expect(reducer(initial(), selectLoop(2000, 1000)).loop).toBeNull();
    expect(reducer(initial(), play(NaN))).toEqual(initial());
  });
});


it('preserves speed across pause/resume and speed changes do not unpause', () => {
  let state = reducer(initial(), play(4));
  state = reducer(state, pause());
  expect(state).toMatchObject({ isPlaying: false, desiredPlaySpeed: 4 });
  state = reducer(state, setPlaySpeed(2));
  expect(state).toMatchObject({ isPlaying: false, desiredPlaySpeed: 2 });
  expect(reducer(state, play())).toMatchObject({ isPlaying: true, desiredPlaySpeed: 2 });
});

it('uses the observed position when changing the selected loop', () => {
  const state = { ...initial(), seekOffset: 0, offset: 30000 };
  expect(reducer(state, selectLoop(10000, 40000)).seekOffset).toBe(30000);
});
