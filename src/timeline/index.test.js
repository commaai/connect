import store from '../store';
import { attachVideo, currentOffset, detachVideo, seek } from '.';
import { selectLoop } from './playback';

// stands in for a <video>: jsdom does not play media
class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.readyState = HTMLMediaElement.HAVE_NOTHING;
    this.currentTime = 0;
    this.paused = true;
    this.play = vi.fn(() => {
      this.paused = false;
      return Promise.resolve();
    });
  }

  loadMetadata() {
    this.readyState = HTMLMediaElement.HAVE_METADATA;
    this.dispatchEvent(new Event('loadedmetadata'));
  }

  playTo(seconds) {
    this.paused = false;
    this.currentTime = seconds;
    this.dispatchEvent(new Event('timeupdate'));
  }
}

describe('playback clock', () => {
  let video;

  beforeEach(() => {
    detachVideo();
    store.dispatch(selectLoop(null, null));
    seek(0);
    video = new FakeVideo();
  });

  it('holds a seek until the video has loaded, then applies it', () => {
    attachVideo(video, 2000);
    seek(5000);
    expect(currentOffset()).toEqual(5000);
    expect(video.currentTime).toEqual(0);

    video.loadMetadata();
    expect(video.currentTime).toEqual(3);
    expect(currentOffset()).toEqual(5000);
  });

  it('follows the video once it has loaded', () => {
    attachVideo(video, 2000);
    video.loadMetadata();

    video.playTo(10);
    expect(currentOffset()).toEqual(12000);

    seek(4000);
    expect(video.currentTime).toEqual(2);
  });

  it('seeks to the first frame when asked for a time before the video starts', () => {
    attachVideo(video, 2000);
    video.loadMetadata();

    seek(500);
    expect(video.currentTime).toEqual(0);
    expect(currentOffset()).toEqual(2000);
  });

  it('starts at and clamps seeks to the selected loop', () => {
    store.dispatch(selectLoop(10000, 20000));
    expect(currentOffset()).toEqual(10000);

    attachVideo(video);
    video.loadMetadata();
    expect(video.currentTime).toEqual(10);

    seek(5000);
    expect(currentOffset()).toEqual(10000);
    seek(25000);
    expect(currentOffset()).toEqual(20000);
  });

  it('wraps to the loop start when playback leaves the loop', () => {
    store.dispatch(selectLoop(10000, 20000));
    attachVideo(video);
    video.loadMetadata();

    video.playTo(15);
    expect(currentOffset()).toEqual(15000);

    video.playTo(20.1);
    expect(video.currentTime).toEqual(10);
  });

  it('does not wrap a paused video sitting at the loop end', () => {
    store.dispatch(selectLoop(10000, 20000));
    attachVideo(video);
    video.loadMetadata();

    seek(20000);
    video.dispatchEvent(new Event('timeupdate'));
    expect(currentOffset()).toEqual(20000);
  });

  it('restarts the loop when the video ends before the loop does', () => {
    store.dispatch(selectLoop(10000, 90000));
    attachVideo(video);
    video.loadMetadata();
    video.playTo(60);

    video.dispatchEvent(new Event('ended'));
    expect(video.currentTime).toEqual(10);
    expect(video.play).toHaveBeenCalled();
  });

  it('keeps the position while the video reloads', () => {
    attachVideo(video);
    video.loadMetadata();
    video.playTo(7);

    video.readyState = HTMLMediaElement.HAVE_NOTHING;
    video.currentTime = 0;
    video.dispatchEvent(new Event('timeupdate'));
    expect(currentOffset()).toEqual(7000);

    video.loadMetadata();
    expect(video.currentTime).toEqual(7);
  });

  it('keeps the last position after the video is detached', () => {
    attachVideo(video);
    video.loadMetadata();
    video.playTo(7);

    detachVideo();
    video.playTo(30);
    expect(currentOffset()).toEqual(7000);
  });
});
