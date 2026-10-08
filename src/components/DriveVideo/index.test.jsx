import { describe, expect, it } from 'vitest';

import { routeOffsetForVideoSeconds, videoSecondsForOffset } from './time';

describe('DriveVideo time conversion', () => {
  const route = { videoStartOffset: 4200 };

  it('keeps timeline offsets anchored to the first video frame', () => {
    expect(videoSecondsForOffset(route, 4200)).toBe(0);
    expect(videoSecondsForOffset(route, 14200)).toBe(10);
    expect(routeOffsetForVideoSeconds(route, 10)).toBe(14200);
  });

  it('never seeks before the playable media begins', () => {
    expect(videoSecondsForOffset(route, 0)).toBe(0);
    expect(routeOffsetForVideoSeconds({}, 1.234)).toBe(1234);
  });
});
