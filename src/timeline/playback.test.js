import { attachVideo, currentOffset, resumePosition, seekTo } from '.';
import { pause, play, playbackChanged, reducer, seek } from './playback';

function fakeVideo(props = {}) {
  return {
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    ...props,
  };
}

const range = { start: 10000, end: 40000 };

afterEach(() => attachVideo(null));

describe('playback clock', () => {
  it('reads the playhead from the video, offset by the first camera frame', () => {
    const video = fakeVideo({ currentTime: 12.5 });
    attachVideo(video, 2000, range);
    expect(currentOffset()).toEqual(14500);
  });

  it('seeks the video, clamped to the selected range', () => {
    const video = fakeVideo();
    attachVideo(video, 2000, range);

    seekTo(20000);
    expect(video.currentTime).toEqual(18);
    seekTo(99000);
    expect(currentOffset()).toEqual(range.end);
    seekTo(0);
    expect(currentOffset()).toEqual(range.start);
  });

  it('never seeks before the start of the video', () => {
    const video = fakeVideo();
    attachVideo(video, 2000);
    seekTo(500);
    expect(video.currentTime).toEqual(0);
  });

  it('holds seeks until the video has loaded', () => {
    const video = fakeVideo({ readyState: HTMLMediaElement.HAVE_NOTHING });
    attachVideo(video, 0, range);
    expect(currentOffset()).toEqual(range.start);

    seekTo(25000);
    expect(currentOffset()).toEqual(25000);
    expect(video.currentTime).toEqual(0);

    video.readyState = HTMLMediaElement.HAVE_METADATA;
    resumePosition();
    expect(video.currentTime).toEqual(25);
    expect(currentOffset()).toEqual(25000);
  });

  it('starts a freshly loaded video at the range start', () => {
    const video = fakeVideo({ readyState: HTMLMediaElement.HAVE_NOTHING });
    attachVideo(video, 0, range);
    video.readyState = HTMLMediaElement.HAVE_METADATA;
    resumePosition();
    expect(video.currentTime).toEqual(10);
  });

  it('drops a held seek when a different video attaches', () => {
    attachVideo(fakeVideo({ readyState: HTMLMediaElement.HAVE_NOTHING }), 0, range);
    seekTo(25000);
    attachVideo(fakeVideo({ readyState: HTMLMediaElement.HAVE_NOTHING }), 0, range);
    expect(currentOffset()).toEqual(range.start);
  });
});

describe('playback controls', () => {
  it('mirrors the video play state', () => {
    let state = reducer({ isPaused: false, playSpeed: 1 }, playbackChanged(fakeVideo({ paused: true, playbackRate: 2 })));
    expect(state).toEqual({ isPaused: true, playSpeed: 2 });
    state = reducer(state, { type: 'OTHER' });
    expect(state).toEqual({ isPaused: true, playSpeed: 2 });
  });

  it('sends commands to the video', () => {
    const video = fakeVideo();
    const dispatch = vi.fn();
    attachVideo(video);

    play(4)(dispatch);
    expect(video.playbackRate).toEqual(4);
    expect(video.play).toHaveBeenCalledOnce();

    pause()(dispatch);
    expect(video.pause).toHaveBeenCalledOnce();

    seek(3000)(dispatch);
    expect(video.currentTime).toEqual(3);
    expect(dispatch).toHaveBeenCalledWith({ type: 'ACTION_SEEK', offset: 3000 });
  });

  it('resyncs when the browser refuses to play', async () => {
    const video = fakeVideo({ play: vi.fn(() => Promise.reject(new Error('NotAllowedError'))) });
    const dispatch = vi.fn();
    attachVideo(video);

    play()(dispatch);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith(playbackChanged(video)));
  });

  it('ignores commands without a video', () => {
    expect(() => play()(vi.fn())).not.toThrow();
    expect(() => pause()(vi.fn())).not.toThrow();
  });
});
