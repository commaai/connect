import { parseQcameraPlaylist, routeToVideoTime, videoToRouteTime } from './videoTime';

// segments 0, 1 and 4 uploaded; 2 and 3 were never uploaded
const PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:61
#EXT-X-PLAYLIST-TYPE:VOD

#EXTINF:59.999955,0
https://example.com/0/qcamera.ts
#EXTINF:60.000264,1
https://example.com/1/qcamera.ts
#EXTINF:24.050192,4
https://example.com/4/qcamera.ts
#EXT-X-ENDLIST
`;

describe('qcamera playlist', () => {
  it('parses numbered segments', () => {
    expect(parseQcameraPlaylist(PLAYLIST)).toEqual([
      { segment: 0, start: 0, duration: 59.999955 },
      { segment: 1, start: 59.999955, duration: 60.000264 },
      { segment: 4, start: 120.000219, duration: 24.050192 },
    ]);
  });

  it('maps time 1:1 when the segments are not numbered', () => {
    const testCases = [
      '#EXTM3U\n#EXTINF:60.0,\nhttps://example.com/0.ts\n',
      '#EXTM3U\n#EXTINF:60.0,title\nhttps://example.com/0.ts\n',
      '#EXTM3U\n#EXT-X-ENDLIST\n',
    ];
    testCases.forEach((playlist) => {
      const segments = parseQcameraPlaylist(playlist);
      expect(segments).toBeNull();
      expect(videoToRouteTime(segments, 42.5)).toEqual(42.5);
      expect(routeToVideoTime(segments, 42.5)).toEqual(42.5);
    });
  });

  it('maps video time to route time across missing segments', () => {
    const segments = parseQcameraPlaylist(PLAYLIST);
    const testCases = [
      { video: 0, route: 0 },
      { video: 30, route: 30 },
      { video: 90, route: 90.000045 },
      // first frame of segment 4, after the two missing segments
      { video: 120.000219, route: 240 },
      { video: 130.000219, route: 250 },
    ];
    testCases.forEach(({ video, route }) => {
      expect(videoToRouteTime(segments, video)).toBeCloseTo(route, 5);
    });
  });

  it('maps route time to video time across missing segments', () => {
    const segments = parseQcameraPlaylist(PLAYLIST);
    const testCases = [
      { route: 0, video: 0 },
      { route: 30, video: 30 },
      { route: 90, video: 89.999955 },
      // inside a missing segment: the next uploaded segment
      { route: 150, video: 120.000219 },
      { route: 239, video: 120.000219 },
      { route: 250, video: 130.000219 },
      // past the end of the last segment
      { route: 400, video: 144.050411 },
    ];
    testCases.forEach(({ route, video }) => {
      expect(routeToVideoTime(segments, route)).toBeCloseTo(video, 5);
    });
  });
});
