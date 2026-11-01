import { describe, expect, it } from 'vitest';
import { routeMsToVideoSec, videoSecToRouteMs } from './video';

describe('video time conversions', () => {
  const route = { videoStartOffset: 2000 };

  it('converts route ms to video seconds', () => {
    expect(routeMsToVideoSec(route, 5000)).toBe(3);
  });

  it('clamps before the video starts to 0', () => {
    expect(routeMsToVideoSec(route, 1000)).toBe(0);
  });

  it('converts video seconds back to route ms', () => {
    expect(videoSecToRouteMs(route, 3)).toBe(5000);
  });

  it('treats a missing videoStartOffset as 0', () => {
    expect(routeMsToVideoSec({}, 4000)).toBe(4);
    expect(videoSecToRouteMs(null, 4)).toBe(4000);
  });
});