import { missingSegments, parsePlaylist, toRouteOffset, toVideoTime } from './video';

const whole = [
  { number: 0, start: 0, duration: 60 },
  { number: 1, start: 60, duration: 60 },
  { number: 2, start: 120, duration: 30 },
];
const omitted = [
  { number: 0, start: 0, duration: 60 },
  { number: 2, start: 60, duration: 60 },
  { number: 3, start: 120, duration: 30 },
];
const gap = parsePlaylist('#EXTM3U\n#EXTINF:59.999955,0\na.ts\n#EXTINF:59.999906,1\nb.ts\n#EXTINF:30,3\nc.ts\n');

describe('playlist', () => {
  it('reads each entry as a numbered segment of the video', () => {
    expect(parsePlaylist(`#EXTM3U
#EXTINF:59.999955,0
https://commadata2.blob.core.windows.net/qlog/dongle/route/0/qcamera.ts?sig=a
#EXTINF:60,2
https://commadata2.blob.core.windows.net/qlog/dongle/route/2/qcamera.ts?sig=b
#EXTINF:25.5,3
https://commadata2.blob.core.windows.net/qlog/dongle/route/3/qcamera.ts?sig=c
#EXT-X-ENDLIST
`)).toEqual([
      { number: 0, start: 0, duration: 59.999955 },
      { number: 2, start: 59.999955, duration: 60 },
      { number: 3, start: 119.999955, duration: 25.5 },
    ]);
    expect(parsePlaylist('#EXTM3U\n#EXTINF:60,\na.ts\n#EXTINF:30,\nb.ts\n')).toEqual([
      { number: 0, start: 0, duration: 60 },
      { number: 1, start: 60, duration: 30 },
    ]);
    expect(parsePlaylist('#EXTM3U\n#EXT-X-ENDLIST\n')).toEqual([]);
  });

  it('lists segments of the route that have no video', () => {
    expect(missingSegments(whole, [0, 1, 2])).toEqual([]);
    expect(missingSegments(omitted, [0, 1, 2, 3])).toEqual([1]);
  });
});

describe('time mapping', () => {
  it.each([
    [whole, 2000, 2000, 0],
    [whole, 2000, 92500, 90.5],
    [whole, 3000, 13000, 10],
    [omitted, 0, 59500, 59.5],
    [omitted, 0, 120000, 60],
    [omitted, 0, 185000, 125],
  ])('maps both ways, row %#', (segments, cameraStart, offset, time) => {
    expect(toVideoTime(segments, cameraStart, offset)).toBe(time);
    expect(toRouteOffset(segments, cameraStart, time)).toBe(offset);
  });

  it.each([
    [whole, 2000, 89.999999, 92000],
    [gap, 849, 119.999861, 180849],
  ])('reads video time as whole milliseconds, since browsers cut it to microseconds, row %#', (segments, cameraStart, time, offset) => {
    expect(toRouteOffset(segments, cameraStart, time)).toBe(offset);
    expect(toRouteOffset(segments, cameraStart, toVideoTime(segments, cameraStart, offset))).toBe(offset);
  });

  it('moves route offsets without video to the next video, or to its end', () => {
    expect(toVideoTime(whole, 2000, 0)).toBe(0);
    expect(toVideoTime(omitted, 0, 70000)).toBe(60);
    expect(toVideoTime(whole, 2000, 500000)).toBe(150);
  });
});
