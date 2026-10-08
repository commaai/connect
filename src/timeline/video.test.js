import { offsetToVideoTime, parsePlaylist, skippedSegments, videoTimeToOffset } from './video';

const playlist = (entries) => [
  '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:61', '#EXT-X-PLAYLIST-TYPE:VOD', '',
  ...entries.flatMap(([duration, segment]) => [`#EXTINF:${duration},${segment}`, `https://example.com/${segment}/qcamera.ts`]),
  '#EXT-X-ENDLIST',
].join('\n');

describe('parsePlaylist', () => {
  it('lists the segments with their video times', () => {
    expect(parsePlaylist(playlist([[60, 0], [60, 2], [24.5, 3]]))).toEqual([
      { segment: 0, start: 0, duration: 60 },
      { segment: 2, start: 60, duration: 60 },
      { segment: 3, start: 120, duration: 24.5 },
    ]);
  });

  it.each([
    ['unnumbered segments', '#EXTM3U\n#EXTINF:60,\na.ts\n#EXTINF:60,\nb.ts'],
    ['no segments', '#EXTM3U\n#EXT-X-ENDLIST'],
  ])('ignores a playlist with %s', (_name, text) => {
    expect(parsePlaylist(text)).toBeNull();
  });
});

describe('video time mapping', () => {
  const segments = parsePlaylist(playlist([[60, 0], [60, 2], [24.5, 3]]));

  it.each([
    [0, 1000],
    [30, 31000],
    [59.5, 60500],
    [60, 121000], // segment 1 is missing
    [90, 151000],
    [130, 191000],
  ])('maps video time %f to offset %i', (time, offset) => {
    expect(videoTimeToOffset(segments, 1000, time)).toBe(offset);
    expect(offsetToVideoTime(segments, 1000, offset)).toBe(time);
  });

  it.each([
    [0, 0], // before the first frame
    [61000, 60], // inside missing segment 1, play on from segment 2
    [100000, 60],
    [500000, 144.5], // after the video
  ])('maps offset %i to video time %f', (offset, time) => {
    expect(offsetToVideoTime(segments, 1000, offset)).toBe(time);
  });

  it('maps linearly without a playlist', () => {
    expect(videoTimeToOffset(null, 1000, 90)).toBe(91000);
    expect(offsetToVideoTime(null, 1000, 91000)).toBe(90);
  });

  it('reports missing segments right after them', () => {
    const missingStart = parsePlaylist(playlist([[60, 2], [60, 3]]));
    expect(skippedSegments(segments, 0, 121000)).toEqual({ first: 1, last: 1 });
    expect(skippedSegments(segments, 0, 125000)).toBeNull();
    expect(skippedSegments(segments, 0, 61000)).toBeNull();
    expect(skippedSegments(missingStart, 0, 120000)).toEqual({ first: 0, last: 1 });
    expect(skippedSegments(null, 0, 120000)).toBeNull();
  });
});
