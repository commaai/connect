import { parseQcameraPlaylist, createVideoMapping, mediaToRoute, routeToMedia } from './videoTime';

const playlist = (entries) => `#EXTM3U\n${entries.map(([number, duration]) => `#EXTINF:${duration},${number}\n${number}/qcamera.ts`).join('\n')}\n#EXT-X-ENDLIST`;
const route = {
  segment_numbers: [0, 1, 2, 3], segment_start_times: [1000, 61000, 121000, 181000],
  segment_end_times: [61000, 121000, 181000, 211000], videoStartOffset: 500,
};
const map = (entries, source = route) => createVideoMapping(source, parseQcameraPlaylist(playlist(entries)));

test('parses numbered entries with media start times, not route start times', () => {
  expect(parseQcameraPlaylist(playlist([[0, 59.5], [2, 60]]))).toEqual([
    { number: 0, start: 0, duration: 59.5 }, { number: 2, start: 59.5, duration: 60 },
  ]);
});

test('missing leading video does not count the first frame twice', () => {
  const mapping = map([[2, 59], [3, 30]], { ...route, videoStartOffset: 121000 });
  expect(mediaToRoute(mapping, 0)).toBe(121000);
  expect(routeToMedia(mapping, 121000)).toBe(0);
  expect(mediaToRoute(mapping, 59)).toBe(180000);
  expect(routeToMedia(mapping, 180000)).toBe(59);
});

test('missing middle snaps forward and tail clamps without a second clock', () => {
  const mapping = map([[0, 59.5], [2, 60]]);
  expect(mediaToRoute(mapping, 0)).toBe(500);
  expect(mediaToRoute(mapping, 59.5)).toBe(120000);
  expect(routeToMedia(mapping, 90000)).toBe(59.5);
  expect(routeToMedia(mapping, 210000)).toBe(119.5);
  expect(mediaToRoute(mapping, 999)).toBe(180000);
});

test('backend timestamps, not fixed 60-second numbering, define route time', () => {
  const mapping = map([[0, 15], [3, 20]], {
    segment_numbers: [0, 3], segment_start_times: [8000, 98000], segment_end_times: [23000, 118000],
  });
  expect(mediaToRoute(mapping, 15)).toBe(90000);
  expect(routeToMedia(mapping, 93000)).toBe(18);
});

test('finite offsets clamp and nonfinite offsets cannot become seeks', () => {
  const mapping = map([[0, 59.5]]);
  expect(routeToMedia(mapping, -1)).toBe(0);
  expect(mediaToRoute(mapping, -1)).toBe(500);
  for (const input of [NaN, Infinity, -Infinity]) {
    expect(routeToMedia(mapping, input)).toBeNull();
    expect(mediaToRoute(mapping, input)).toBeNull();
  }
});

it.each([
  '', '#EXTM3U', '#EXTM3U\n#EXTINF:60,0', '#EXTM3U\n0/qcamera.ts',
  playlist([[0, 0]]), playlist([[0, -1]]), playlist([[0, 60], [0, 60]]),
  playlist([[2, 60], [1, 60]]), playlist([['NaN', 60]]), playlist([['', 60]]),
  playlist([[9007199254740992, 60]]), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nstream.m3u8',
])('rejects unknown or invalid playlists: %s', (text) => {
  expect(parseQcameraPlaylist(text)).toBeNull();
});

it.each([
  { segment_numbers: [0, 0] }, { segment_start_times: [1000, NaN, 121000, 181000] },
  { segment_end_times: [1000, 121000, 181000, 211000] }, { videoStartOffset: Infinity },
])('does not guess timing from bad backend metadata %j', (change) => {
  expect(map([[0, 59.5]], { ...route, ...change })).toBeNull();
});

test('unknown segment identity and non-contiguous media coordinates are rejected', () => {
  expect(map([[9, 60]])).toBeNull();
  expect(createVideoMapping(route, [{ number: 0, start: 2, duration: 60 }])).toBeNull();
});

test('mapping round trips valid playable positions', () => {
  const mapping = map([[0, 59.5], [2, 60], [3, 30]]);
  for (const entry of mapping) {
    for (let i = 0; i < 100; i++) {
      const offset = entry.routeStart + (entry.routeEnd - entry.routeStart) * i / 100;
      expect(mediaToRoute(mapping, routeToMedia(mapping, offset))).toBeCloseTo(offset, 6);
    }
  }
});
