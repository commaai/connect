import { describe, expect, it, beforeEach } from 'vitest';
import {
  bindMediaElement,
  readRouteOffsetMs,
  resetMediaSessionForTests,
  unbindMediaElement,
} from './media';

describe('media session', () => {
  beforeEach(() => {
    resetMediaSessionForTests();
  });

  it('returns a pending offset when there is no route or mounted player', () => {
    expect(readRouteOffsetMs({})).toBe(0);
    expect(readRouteOffsetMs({ offset: 0, zoom: { start: 5000 } })).toBe(0);
    expect(readRouteOffsetMs({ zoom: { start: 5000 } })).toBe(5000);
  });

  it('does not let an old controller detach its replacement on the same element', () => {
    const video = {};
    const old = {};
    const controller = { readOffset: () => 12000 };
    bindMediaElement(video, { routeFullname: 'a|one', controller: old });
    bindMediaElement(video, { routeFullname: 'a|one', controller });
    unbindMediaElement(video, old);
    expect(readRouteOffsetMs({ currentRoute: { fullname: 'a|one' } })).toBe(12000);
  });

  it('does not read another route from the active element', () => {
    const video = { currentTime: 5, readyState: 2 };
    bindMediaElement(video, {
      routeFullname: 'a|one',
      sourceUrl: 'https://example.test/a.m3u8',
      generation: 1,
    });

    const state = {
      offset: 1000,
      currentRoute: { fullname: 'b|two', videoStartOffset: 0 },
      zoom: { start: 0, end: 10000 },
    };

    expect(readRouteOffsetMs(state)).toEqual(1000);
    unbindMediaElement(video);
  });
});
