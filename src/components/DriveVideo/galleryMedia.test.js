import { installGalleryMedia } from '../../../scripts/gallery-media.mjs';
import VideoSession from './VideoSession';

vi.mock('hls.js', () => ({ default: class {
  static isSupported() { throw new Error('Gallery media should use its native fixture'); }
} }));

let src, canPlayType;
beforeEach(() => {
  src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  canPlayType = HTMLMediaElement.prototype.canPlayType;
  installGalleryMedia(925);
});
afterEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'src', src);
  HTMLMediaElement.prototype.canPlayType = canPlayType;
  vi.restoreAllMocks();
});

it('settles the real video session without assigning a source or advancing media time', async () => {
  const video = document.createElement('video');
  vi.spyOn(video, 'load').mockImplementation(() => {});
  vi.spyOn(video, 'pause').mockImplementation(() => {});
  const dispatch = vi.fn();
  const onError = vi.fn();
  const session = new VideoSession(video, dispatch, onError);
  session.update({ type: 'ATTACH_PLAYER' }, {
    offset: 0, desiredPlaySpeed: 1,
    currentRoute: { fullname: 'gallery-route', duration: 925000 },
  });
  session.load('https://api.comma.ai/v1/route/gallery-route/qcamera.m3u8?sig=fixture');
  await Promise.resolve();
  expect(video.readyState).toBe(HTMLMediaElement.HAVE_ENOUGH_DATA);
  expect(video.duration).toBe(925);
  expect(video.currentTime).toBe(0);
  expect(video.paused).toBe(true);
  expect(video).not.toHaveAttribute('src');
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ playback: { isBufferingVideo: false } }));
  expect(onError).not.toHaveBeenCalledWith(expect.any(String));
  session.destroy();
});

it('leaves unrelated media sources and codec queries alone', () => {
  const video = document.createElement('video');
  const audio = document.createElement('audio');
  video.src = '/normal.webm';
  audio.src = '/qcamera.m3u8';
  expect(video).toHaveAttribute('src', '/normal.webm');
  expect(audio).toHaveAttribute('src', '/qcamera.m3u8');
  expect(video.readyState).toBe(HTMLMediaElement.HAVE_NOTHING);
  expect(video.canPlayType('video/webm')).toBe(canPlayType.call(video, 'video/webm'));
  expect(audio.canPlayType('application/vnd.apple.mpegurl')).toBe(canPlayType.call(audio, 'application/vnd.apple.mpegurl'));
});
