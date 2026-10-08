import { vi } from 'vitest';

// a stand-in for the video element: just the state and events the player uses
function fakeVideo({ readyState = 1 } = {}) {
  const video = new EventTarget();
  Object.assign(video, {
    readyState,
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    defaultPlaybackRate: 1,
    play: vi.fn(() => {
      video.paused = false;
      video.dispatchEvent(new Event('play'));
      return Promise.resolve();
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
  });
  return video;
}

function loadMetadata(video) {
  video.readyState = 1;
  video.dispatchEvent(new Event('loadedmetadata'));
}

describe('player', () => {
  let player;

  beforeEach(async () => {
    vi.resetModules();
    player = await import('./player');
  });

  it('reads the position from the video', () => {
    const video = fakeVideo({ readyState: 0 });
    player.attachVideo(video);
    loadMetadata(video);
    video.currentTime = 12.5;
    expect(player.getOffset()).toEqual(12500);

    player.setVideoStartOffset(2000);
    expect(player.getOffset()).toEqual(14500);
  });

  it('applies a seek made before the video has loaded', () => {
    const video = fakeVideo({ readyState: 0 });
    player.attachVideo(video);

    player.seek(30000);
    expect(player.getOffset()).toEqual(30000);
    expect(video.currentTime).toEqual(0);

    loadMetadata(video);
    expect(video.currentTime).toEqual(30);
    expect(player.getOffset()).toEqual(30000);
  });

  it('keeps the requested position until the video has loaded', () => {
    const video = fakeVideo({ readyState: 0 });
    player.attachVideo(video);
    player.seek(120000);

    // readyState rises before the loadedmetadata event is delivered
    video.readyState = 1;
    expect(player.getOffset()).toEqual(120000);

    loadMetadata(video);
    expect(video.currentTime).toEqual(120);
  });

  it('maps route offsets to video time', () => {
    const testCases = [
      { videoStartOffset: 0, seek: 5000, videoTime: 5 },
      { videoStartOffset: 2000, seek: 5000, videoTime: 3 },
      // before the first video frame: start of the video
      { videoStartOffset: 2000, seek: 1000, videoTime: 0 },
    ];
    testCases.forEach(({ videoStartOffset, seek, videoTime }) => {
      const video = fakeVideo();
      const detach = player.attachVideo(video);
      player.setVideoStartOffset(videoStartOffset);
      player.seek(seek);
      expect(video.currentTime).toEqual(videoTime);
      detach();
    });
  });

  it('keeps seeks inside the selected section and starts it from the beginning', () => {
    const video = fakeVideo();
    player.attachVideo(video);
    video.currentTime = 50;

    player.setLoop(10000, 20000);
    expect(video.currentTime).toEqual(10);

    player.seek(5000);
    expect(video.currentTime).toEqual(10);
    player.seek(25000);
    expect(video.currentTime).toEqual(20);
    player.seek(15000);
    expect(video.currentTime).toEqual(15);

    player.setLoop(null, null);
    player.seek(25000);
    expect(video.currentTime).toEqual(25);
  });

  it('wraps around at the end of the section', () => {
    const frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => frames.push(cb));
    const video = fakeVideo();
    player.attachVideo(video);
    player.setLoop(10000, 20000);
    player.play();

    video.currentTime = 19;
    frames.shift()();
    expect(video.currentTime).toEqual(19);

    video.currentTime = 20.1;
    frames.shift()();
    expect(video.currentTime).toEqual(10);
    vi.unstubAllGlobals();
  });

  it('starts the section over when the video ends', () => {
    const video = fakeVideo();
    player.attachVideo(video);
    player.setLoop(0, 60000);
    video.currentTime = 42;
    video.paused = true;

    video.dispatchEvent(new Event('ended'));
    expect(video.currentTime).toEqual(0);
    expect(video.play).toHaveBeenCalled();
  });

  it('applies play state and speed chosen before the video exists', () => {
    player.setPlaySpeed(2);
    player.pause();

    const video = fakeVideo({ readyState: 0 });
    player.attachVideo(video);
    loadMetadata(video);
    expect(video.playbackRate).toEqual(2);
    expect(video.defaultPlaybackRate).toEqual(2);
    expect(video.play).not.toHaveBeenCalled();

    player.play();
    expect(video.play).toHaveBeenCalled();
    expect(player.isPlaying()).toBe(true);
  });

  it('stays paused when the browser refuses to autoplay', async () => {
    const changed = vi.fn();
    const video = fakeVideo({ readyState: 0 });
    video.play = vi.fn(() => Promise.reject(Object.assign(new Error('autoplay'), { name: 'NotAllowedError' })));
    player.attachVideo(video, changed);
    loadMetadata(video);
    await Promise.resolve();
    await Promise.resolve();

    expect(player.isPlaying()).toBe(false);
    expect(changed).toHaveBeenCalled();
  });

  it('follows play and pause from outside the app', () => {
    const changed = vi.fn();
    const video = fakeVideo();
    player.attachVideo(video, changed);
    expect(player.isPlaying()).toBe(true);

    video.paused = true;
    video.dispatchEvent(new Event('pause'));
    expect(player.isPlaying()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);

    video.paused = false;
    video.dispatchEvent(new Event('play'));
    expect(player.isPlaying()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('keeps playing when the video pauses because it reached the end', () => {
    const video = fakeVideo();
    player.attachVideo(video);
    player.setLoop(0, 60000);
    video.ended = true;
    video.paused = true;
    video.dispatchEvent(new Event('pause'));
    video.dispatchEvent(new Event('ended'));
    expect(player.isPlaying()).toBe(true);
    expect(video.currentTime).toEqual(0);
  });

  it('keeps the position when the source is reloaded', () => {
    const video = fakeVideo();
    player.attachVideo(video);
    video.currentTime = 42;

    player.releaseSource();
    // tearing down the source resets the element before it reports 'emptied'
    video.currentTime = 0;
    expect(player.getOffset()).toEqual(42000);

    loadMetadata(video);
    expect(video.currentTime).toEqual(42);
  });

  it('maps time across segments missing from the video', () => {
    const video = fakeVideo({ readyState: 0 });
    player.attachVideo(video);
    // segment 1 was never uploaded
    player.setSegments([{ segment: 0, start: 0, duration: 60 }, { segment: 2, start: 60, duration: 60 }]);
    player.seek(150000);
    loadMetadata(video);
    expect(video.currentTime).toEqual(90);

    video.currentTime = 70;
    expect(player.getOffset()).toEqual(130000);

    // inside the missing segment: the start of the next uploaded one
    player.seek(100000);
    expect(video.currentTime).toEqual(60);
  });

  it('remembers the position after the video is removed', () => {
    const video = fakeVideo();
    const detach = player.attachVideo(video);
    video.currentTime = 40;
    detach();
    video.currentTime = 0;
    expect(player.getOffset()).toEqual(40000);
  });
});
