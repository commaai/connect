import { getEffectivePlayBounds, normalizeRange, routeMsFromVideoSeconds,
  videoSecondsFromRouteMs } from './timing';

describe('route/media timing', () => {
  it('maps the first encoded frame offset in both directions', () => {
    expect(routeMsFromVideoSeconds(12.5, 849)).toBe(13349);
    expect(videoSecondsFromRouteMs(13349, 849)).toBe(12.5);
    expect(videoSecondsFromRouteMs(0, 849)).toBe(0);
  });
  it('intersects selected, route, and actual media coverage', () => {
    const state = { currentRoute: { duration: 925000, videoStartOffset: 849 },
      zoom: { start: 0, end: 925000 } };
    expect(getEffectivePlayBounds(state, 924.050522)).toEqual({ start: 849, end: 924899.522 });
    expect(getEffectivePlayBounds({ ...state, loop: { startTime: 1000, duration: 10000 } }, 924))
      .toEqual({ start: 1000, end: 11000 });
    expect(getEffectivePlayBounds({ ...state, zoom: { start: 0, end: 500 } }, 924)).toBeNull();
  });
  it('normalizes URL ranges outwards to whole seconds and preserves whole-drive duration', () => {
    expect(normalizeRange(123, 1234, 60000)).toEqual({ start: 0, end: 2000 });
    expect(normalizeRange(0, 925123, 925123)).toEqual({ start: 0, end: 925123 });
    expect(normalizeRange(0, 999999, 925123)).toEqual({ start: 0, end: 925123 });
    for (const [start, end] of [[null, null], [-1, 100], [100, 100], [60000, 61000], [NaN, 2]]) {
      expect(normalizeRange(start, end, 60000)).toBeNull();
    }
  });
});
