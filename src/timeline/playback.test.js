import { reducer, selectLoop, seekTarget } from './playback';

describe('playback', () => {
  // whole-loop bounds in route ms: video starts 1000 ms in and lasts 10000 ms
  const bounds = (loopStart, loopEnd) => ({ videoStart: 1000, videoDuration: 10000, loopStart, loopEnd });

  it('should clamp a seek past the loop end to the loop end', () => {
    const state = reducer({}, selectLoop(2000, 4000));
    expect(state.loop).toEqual({ startTime: 2000, duration: 2000 });
    const { startTime, duration } = state.loop;
    expect(seekTarget(6000, bounds(startTime, startTime + duration))).toEqual(3000);
  });

  it('should clamp a seek before the loop start to the loop start', () => {
    const state = reducer({}, selectLoop(2000, 4000));
    const { startTime, duration } = state.loop;
    expect(seekTarget(0, bounds(startTime, startTime + duration))).toEqual(1000);
  });
});
