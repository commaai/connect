import { describe, it, expect } from 'vitest';
import { videoMapping } from './videoTime';

const route = { segment_numbers: [0, 2], segment_start_times: [1000, 121000], segment_end_times: [61000, 181000], videoStartOffset: 500 };
const playlist = '#EXTM3U\n#EXTINF:59.5,0\n0.ts\n#EXTINF:60,2\n2.ts\n';
describe('playlist route timing', () => {
  it('aligns the first video frame and skips missing middle segments', () => {
    const map = videoMapping(route, playlist);
    expect(map.toRoute(0)).toBe(500);
    expect(map.toRoute(59.5)).toBe(120000);
    expect(map.toMedia(90000)).toBe(59.5);
    expect(map.toMedia(130000)).toBe(69.5);
  });
  it('uses timestamps rather than assuming sixty second segments', () => {
    const map = videoMapping({ ...route, segment_start_times: [1000, 91000], segment_end_times: [16000, 111000], videoStartOffset: 0 }, playlist.replace('59.5', '15').replace('60,2', '20,2'));
    expect(map.toRoute(15)).toBe(90000);
  });
  it('normalizes boot-relative timestamps and rejects unknown segment identities', () => {
    const map = videoMapping({ ...route, segment_start_times: [1700000000000, 120000], segment_end_times: [1700000060000, 180000] }, playlist);
    expect(map.toRoute(59.5)).toBe(120000);
    expect(() => videoMapping(route, playlist.replace('60,2', '60,9'))).toThrow('Invalid video segment timing');
  });
});
