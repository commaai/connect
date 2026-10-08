import { attachVideo, currentOffset, isPastVideoEnd, moveTo, pendingVideoTime } from '.';
import { pause, play, playbackRateChanged, reducer, seek, selectLoop } from './playback';

// the parts of a <video> the clock reads and writes
function fakeVideo({ readyState = 4, currentTime = 0, duration = 360 } = {}) {
  let time = currentTime;
  return {
    readyState,
    duration,
    get currentTime() { return time; },
    set currentTime(t) { time = Math.min(t, duration); },
  };
}

function run(thunk, state) {
  const dispatched = [];
  thunk((action) => dispatched.push(action), () => state);
  return dispatched;
}

afterEach(() => attachVideo(null));

describe('playback clock', () => {
  it('reads the playhead from the video, offset by when its first frame was recorded', () => {
    const video = fakeVideo({ currentTime: 12.5 });
    attachVideo(video, 1200);
    expect(currentOffset()).toBe(13700);
    video.currentTime = 13;
    expect(currentOffset()).toBe(14200);
  });

  it('moves the video to an offset into the route', () => {
    const video = fakeVideo();
    attachVideo(video, 1200);
    moveTo(31200);
    expect(video.currentTime).toBe(30);
    moveTo(500);
    expect(video.currentTime).toBe(0);
  });

  it('keeps the playhead where it was put until the video can tell the time', () => {
    const video = fakeVideo({ readyState: 0 });
    attachVideo(video, 1000);
    moveTo(61000);
    expect(currentOffset()).toBe(61000);
    expect(video.currentTime).toBe(0);
    expect(pendingVideoTime()).toBe(60);
  });

  it('keeps the playhead past the end of a video that is still uploading', () => {
    const video = fakeVideo({ duration: 240 });
    attachVideo(video, 0);
    moveTo(300000);
    expect(video.currentTime).toBe(240);
    expect(isPastVideoEnd()).toBe(true);
    expect(currentOffset()).toBe(300000);
    moveTo(60000);
    expect(isPastVideoEnd()).toBe(false);
    expect(currentOffset()).toBe(60000);
  });

  it('follows a video that played to its end', () => {
    const video = fakeVideo({ duration: 240 });
    attachVideo(video, 0);
    moveTo(0);
    video.currentTime = 240;
    expect(isPastVideoEnd()).toBe(false);
    expect(currentOffset()).toBe(240000);
  });

  it('keeps the playhead without a video', () => {
    moveTo(5000);
    expect(currentOffset()).toBe(5000);
  });
});

describe('playback state', () => {
  it('follows what the video does', () => {
    let state = { isPlaying: false, playbackRate: 1 };
    state = reducer(state, play());
    expect(state.isPlaying).toBe(true);
    state = reducer(state, playbackRateChanged(2));
    expect(state.playbackRate).toBe(2);
    state = reducer(state, pause());
    expect(state).toEqual({ isPlaying: false, playbackRate: 2 });
  });

  it('leaves the state alone for other actions', () => {
    const state = { isPlaying: true };
    expect(reducer(state, { type: 'OTHER' })).toBe(state);
  });

  it('selects and clears a loop', () => {
    expect(reducer({}, selectLoop(1000, 4000)).loop).toEqual({ startTime: 1000, duration: 3000 });
    expect(reducer({}, selectLoop(null, null)).loop).toBeNull();
  });

  it.each([
    ['inside', 2000, 2000],
    ['before', 500, 1000],
    ['after', 9000, 4000],
  ])('seeks %s the loop to a point inside it', (_name, offset, expected) => {
    const video = fakeVideo();
    attachVideo(video, 0);
    const actions = run(seek(offset), { loop: { startTime: 1000, duration: 3000 } });
    expect(actions).toEqual([{ type: 'ACTION_SEEK', offset: expected }]);
    expect(video.currentTime).toBe(expected / 1000);
  });
});
