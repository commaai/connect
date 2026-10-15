import { clampRouteMsToLoop, videoSecondsToRouteMs, routeMsToVideoSeconds } from './routeTime';

const videoStartOffset = 2000;
const loop = { startTime: 10000, duration: 5000 };

describe('route time', () => {
  it('converts between video seconds and route milliseconds', () => {
    expect(videoSecondsToRouteMs(videoStartOffset, 3)).toBe(5000);
    expect(routeMsToVideoSeconds(videoStartOffset, 5000)).toBe(3);
  });

  it('maps times before the first video frame to the start of the video', () => {
    expect(routeMsToVideoSeconds(videoStartOffset, 1000)).toBe(0);
  });

  it('treats a missing video start offset as zero', () => {
    expect(videoSecondsToRouteMs(undefined, 3)).toBe(3000);
  });

  it('clamps times into the loop', () => {
    expect(clampRouteMsToLoop(5000, loop)).toBe(10000);
    expect(clampRouteMsToLoop(12000, loop)).toBe(12000);
    expect(clampRouteMsToLoop(20000, loop)).toBe(15000);
  });

  it('leaves times untouched without a loop', () => {
    expect(clampRouteMsToLoop(20000, null)).toBe(20000);
  });
});
