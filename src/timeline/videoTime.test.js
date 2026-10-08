import { parseQcameraPlaylist, routeToVideoTime, videoToRouteOffset } from './videoTime';

// segments are slightly shorter than 60s, like real qcamera recordings
const DURATION = 59.99995;

function playlist(segmentNumbers, titled = true) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:61', '#EXT-X-PLAYLIST-TYPE:VOD', ''];
  segmentNumbers.forEach((n) => {
    lines.push(`#EXTINF:${DURATION},${titled ? n : ''}`);
    lines.push(`https://example.com/qlog/abc/${n}/qcamera.ts?sig=a%3Db`);
  });
  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n');
}

const route = (videoStartOffset = 0) => ({ videoStartOffset });

describe('parseQcameraPlaylist', () => {
  it('reads segment numbers and accumulates video start times from durations', () => {
    expect(parseQcameraPlaylist(playlist([0, 1, 3]))).toEqual([
      { number: 0, start: 0, duration: DURATION },
      { number: 1, start: DURATION, duration: DURATION },
      { number: 3, start: DURATION * 2, duration: DURATION },
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseQcameraPlaylist(playlist([0, 2]).replace(/\n/g, '\r\n')).map((s) => s.number)).toEqual([0, 2]);
  });

  it('gives up on playlists without segment numbers, so playback assumes no gaps', () => {
    expect(parseQcameraPlaylist(playlist([0, 1], false))).toBeNull();
    expect(parseQcameraPlaylist('not a playlist')).toBeNull();
    expect(parseQcameraPlaylist('')).toBeNull();
  });
});

describe('video <-> route time', () => {
  it('without a parsed playlist, video time is route time minus videoStartOffset', () => {
    expect(videoToRouteOffset(route(1500), null, 10)).toEqual(11500);
    expect(routeToVideoTime(route(1500), null, 11500)).toEqual(10);
  });

  it('agrees with the gapless formula (to the ms) on a complete playlist', () => {
    const segments = parseQcameraPlaylist(playlist([0, 1, 2, 3]));
    const t = DURATION * 2 + 30;
    expect(videoToRouteOffset(route(800), segments, t)).toBeCloseTo(800 + (2 * 60000) + 30000, 0);
    expect(routeToVideoTime(route(800), segments, 800 + (2 * 60000) + 30000)).toBeCloseTo(t, 3);
  });

  it('maps video after a missing segment to the right route time', () => {
    const segments = parseQcameraPlaylist(playlist([0, 1, 3, 4]));
    // 10s into the third playlist entry is 10s into segment 3, not segment 2
    expect(videoToRouteOffset(route(), segments, (DURATION * 2) + 10)).toBeCloseTo((3 * 60000) + 10000, 0);
    expect(routeToVideoTime(route(), segments, (3 * 60000) + 10000)).toBeCloseTo((DURATION * 2) + 10, 3);
  });

  it('skips a seek into a missing segment to the start of the next one', () => {
    const segments = parseQcameraPlaylist(playlist([0, 1, 3, 4]));
    expect(routeToVideoTime(route(), segments, (2 * 60000) + 25000)).toEqual(DURATION * 2);
  });

  it('skips several consecutive missing segments at once', () => {
    const segments = parseQcameraPlaylist(playlist([0, 4]));
    expect(routeToVideoTime(route(), segments, 60000 + 5)).toEqual(DURATION);
    expect(videoToRouteOffset(route(), segments, DURATION + 1)).toBeCloseTo((4 * 60000) + 1000, 0);
  });

  it('handles a route whose first segment has no video', () => {
    const segments = parseQcameraPlaylist(playlist([1, 2]));
    expect(routeToVideoTime(route(), segments, 0)).toEqual(0);
    expect(videoToRouteOffset(route(), segments, 0)).toEqual(60000);
  });

  it('clamps seeks past the last segment with video to the end of the video', () => {
    const segments = parseQcameraPlaylist(playlist([0, 1]));
    expect(routeToVideoTime(route(), segments, 5 * 60000)).toEqual(DURATION * 2);
    expect(routeToVideoTime(route(), null, -5000)).toEqual(0);
  });

  it('clamps seeks before the video starts to video time 0', () => {
    const segments = parseQcameraPlaylist(playlist([0, 1]));
    expect(routeToVideoTime(route(2000), segments, 500)).toEqual(0);
  });

  it('stays inside a segment at its last frame instead of rounding into a missing one', () => {
    const segments = parseQcameraPlaylist(playlist([0, 2]));
    // 59.9999s into segment 0 must not jump to the missing segment 1
    expect(routeToVideoTime(route(), segments, 59999.9)).toBeCloseTo(59.9999, 6);
  });

  it('round trips video time through route time', () => {
    const segments = parseQcameraPlaylist(playlist([0, 2, 3, 7]));
    [0, 12.5, DURATION + 1, (DURATION * 3) + 59].forEach((t) => {
      const offset = videoToRouteOffset(route(1234), segments, t);
      expect(routeToVideoTime(route(1234), segments, offset)).toBeCloseTo(t, 3);
    });
  });
});
