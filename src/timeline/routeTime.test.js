import { clampToLoop, toRouteMs, toVideoSeconds } from './routeTime';

const route = { videoStartOffset: 2000 };
const loop = { startTime: 10000, duration: 5000 };

describe('route time', () => {
  it('converts between video seconds and route milliseconds', () => {
    expect(toRouteMs(route, 3)).toBe(5000);
    expect(toVideoSeconds(route, 5000)).toBe(3);
  });

  it('maps times before the first video frame to the start of the video', () => {
    expect(toVideoSeconds(route, 1000)).toBe(0);
  });

  it('treats a missing video start offset as zero', () => {
    expect(toRouteMs({}, 3)).toBe(3000);
  });

  it('clamps times into the loop', () => {
    expect(clampToLoop(5000, loop)).toBe(10000);
    expect(clampToLoop(12000, loop)).toBe(12000);
    expect(clampToLoop(20000, loop)).toBe(15000);
  });

  it('leaves times untouched without a loop', () => {
    expect(clampToLoop(20000, null)).toBe(20000);
  });
});
