import { offsetToVideoTime, parsePlaylist, videoTimeToOffset } from './playlist';

const playlist = (segments) => [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:61',
  '#EXT-X-PLAYLIST-TYPE:VOD',
  '',
  ...segments.flatMap(([duration, number]) => [`#EXTINF:${duration},${number}`, `https://example.com/${number}/qcamera.ts`]),
  '#EXT-X-ENDLIST',
].join('\n');

describe('qcamera playlist', () => {
  it('parses segment numbers and video start times', () => {
    expect(parsePlaylist(playlist([[60, 0], [60, 1], [24.5, 2]]))).toEqual([
      { number: 0, start: 0, duration: 60 },
      { number: 1, start: 60, duration: 60 },
      { number: 2, start: 120, duration: 24.5 },
    ]);
    expect(parsePlaylist('#EXTM3U\n#EXT-X-ENDLIST\n')).toEqual([]);
  });

  it('maps video time to route time linearly without gaps', () => {
    const segments = parsePlaylist(playlist([[60, 0], [60, 1], [60, 2]]));
    expect(videoTimeToOffset(segments, 500, 0)).toEqual(500);
    expect(videoTimeToOffset(segments, 500, 90)).toEqual(90500);
    expect(offsetToVideoTime(segments, 500, 90500)).toEqual(90);
    expect(offsetToVideoTime(segments, 500, 0)).toEqual(0);
  });

  it('maps around segments without video', () => {
    const segments = parsePlaylist(playlist([[60, 0], [60, 1], [60, 3], [60, 4]]));
    expect(videoTimeToOffset(segments, 0, 119)).toEqual(119000);
    expect(videoTimeToOffset(segments, 0, 120)).toEqual(180000);
    expect(videoTimeToOffset(segments, 0, 150)).toEqual(210000);
    expect(offsetToVideoTime(segments, 0, 210000)).toEqual(150);
    expect(offsetToVideoTime(segments, 0, 150000)).toEqual(120);
    expect(offsetToVideoTime(segments, 0, 600000)).toEqual(240);
  });

  it('maps a route whose first segments have no video', () => {
    const segments = parsePlaylist(playlist([[60, 2], [60, 3]]));
    expect(videoTimeToOffset(segments, 0, 0)).toEqual(120000);
    expect(offsetToVideoTime(segments, 0, 30000)).toEqual(0);
    expect(offsetToVideoTime(segments, 0, 150000)).toEqual(30);
  });
});
