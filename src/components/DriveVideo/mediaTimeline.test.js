import { mediaTimeline, playlistTimeline } from './mediaTimeline';

const playlist = '#EXTM3U\n#EXTINF:59.999,0\n0/qcamera.ts\n#EXTINF:60,2\n2/qcamera.ts\n';
it('maps compressed media time to the actual uploaded route segment', () => {
  const clock = playlistTimeline(playlist);
  expect(clock.toRoute(60.999, 500)).toBe(121500);
  expect(clock.toMedia(121500, 500)).toBe(60.999);
});
it('lands a seek in missing footage at the next available route segment', () => {
  const clock = playlistTimeline(playlist);
  expect(clock.toMedia(85000, 0)).toBe(59.999);
  expect(clock.toRoute(clock.toMedia(85000, 0), 0)).toBe(120000);
  expect(clock.toMedia(-1000, 0)).toBe(0);
  expect(clock.toMedia(200000, 0)).toBe(119.999);
});
it('uses updated fragment start timestamps after HLS parsing', () => {
  const fragments = [{ start: 0, duration: 60, title: '0' }, { start: 60, duration: 60, title: '2' }];
  const clock = mediaTimeline(fragments);
  fragments[1].start = 120;
  expect(clock.toRoute(121, 0)).toBe(121000);
  expect(clock.toMedia(121000, 0)).toBe(121);
});
it('falls back to the native timeline for ordinary or invalid playlists', () => {
  for (const text of ['', '#EXTM3U\n#EXTINF:60,\nclip.ts', '#EXTINF:60,hello', '#EXTINF:60,0\n#EXTINF:60,0', '#EXTINF:NaN,0']) expect(playlistTimeline(text)).toBeNull();
});

it('uses video timestamps rather than audio padding through an omitted minute', () => {
  const clock = mediaTimeline([
    { start: 0, duration: 60, title: '0', elementaryStreams: { video: { startPTS: .02 } } },
    { start: 60, startPTS: 60, duration: 120, title: '2', elementaryStreams: { video: { startPTS: 120.02 } } },
  ]);
  expect(clock.toMedia(85000, 0)).toBe(120.02);
  expect(clock.toRoute(120.02, 0)).toBe(120000);
  expect(clock.toRoute(120.0199999, 0)).toBe(120000);
});

it('does not mistake padded timestamps for footage in a missing minute', () => {
  const fragments = [
    { start: 0, duration: 60, title: '0' },
    { start: 60, duration: 60, title: '2' },
  ];
  const clock = mediaTimeline(fragments);
  fragments[1].duration = 120;
  fragments[1].elementaryStreams = { video: { startPTS: 60, endPTS: 180 } };
  expect(clock.toMedia(85000, 0)).toBe(120);
  expect(clock.toMedia(150000, 0)).toBe(150);
  expect(clock.toRoute(150, 0)).toBe(150000);
});
