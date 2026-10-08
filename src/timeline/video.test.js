import * as Types from '../actions/types';
import {
  attachVideo, detachVideo, isActiveVideo, isStalled, playbackRange, seekVideo, videoMiddleware, videoOffset,
} from './video';

const route = { fullname: 'abc|route', videoStartOffset: 2000 };
const otherRoute = { fullname: 'abc|other' };

function fakeVideo(props = {}) {
  return { readyState: 4, currentTime: 0, duration: 60, ...props };
}

afterEach(() => {
  detachVideo();
});

describe('videoOffset', () => {
  it('is null without an attached video', () => {
    expect(videoOffset(route)).toBeNull();
  });

  it('reads the video time plus the video start offset', () => {
    attachVideo(fakeVideo({ currentTime: 10 }), route.fullname);
    expect(videoOffset(route)).toEqual(12000);
  });

  it('is null for a different route', () => {
    attachVideo(fakeVideo({ currentTime: 10 }), route.fullname);
    expect(videoOffset(otherRoute)).toBeNull();
    expect(videoOffset(null)).toBeNull();
  });

  it('is null before the video has metadata', () => {
    attachVideo(fakeVideo({ readyState: 0 }), route.fullname);
    expect(videoOffset(route)).toBeNull();
  });

  it('only detaches the given element', () => {
    const video = fakeVideo({ currentTime: 1 });
    attachVideo(video, route.fullname);
    detachVideo(fakeVideo());
    expect(videoOffset(route)).toEqual(3000);
    detachVideo(video);
    expect(videoOffset(route)).toBeNull();
  });
});

describe('seekVideo', () => {
  it('seeks relative to the video start offset', () => {
    const video = fakeVideo();
    attachVideo(video, route.fullname);
    expect(seekVideo(route, 7000)).toBe(true);
    expect(video.currentTime).toEqual(5);
  });

  it('clamps to the start and end of the video', () => {
    const video = fakeVideo();
    attachVideo(video, route.fullname);
    seekVideo(route, 0);
    expect(video.currentTime).toEqual(0);
    seekVideo(route, 999999);
    expect(video.currentTime).toEqual(60);
  });

  it('does nothing without a video for the route', () => {
    const video = fakeVideo({ currentTime: 3 });
    attachVideo(video, route.fullname);
    expect(seekVideo(otherRoute, 7000)).toBe(false);
    expect(seekVideo(route, null)).toBe(false);
    expect(video.currentTime).toEqual(3);
  });
});

describe('videoMiddleware', () => {
  function run(action, state) {
    const next = vi.fn(() => 'result');
    const result = videoMiddleware({ getState: () => state })(next)(action);
    expect(next).toHaveBeenCalledWith(action);
    return result;
  }

  it('applies seeks to the video', () => {
    const video = fakeVideo();
    attachVideo(video, route.fullname);
    expect(run({ type: Types.ACTION_SEEK, offset: 12000 }, { currentRoute: route, offset: 12000 })).toEqual('result');
    expect(video.currentTime).toEqual(10);
  });

  it('moves the video into a new loop it is outside of', () => {
    const video = fakeVideo({ currentTime: 50 });
    attachVideo(video, route.fullname);
    run({ type: Types.ACTION_LOOP }, { currentRoute: route, loop: { startTime: 10000, duration: 5000 } });
    expect(video.currentTime).toEqual(8);
  });

  it('leaves the video alone inside a new loop', () => {
    const video = fakeVideo({ currentTime: 10 });
    attachVideo(video, route.fullname);
    run({ type: Types.ACTION_LOOP }, { currentRoute: route, loop: { startTime: 10000, duration: 5000 } });
    expect(video.currentTime).toEqual(10);
  });
});

describe('isStalled', () => {
  it('is stalled without a video', () => {
    expect(isStalled(null)).toBe(true);
  });

  it('is stalled while seeking', () => {
    expect(isStalled(fakeVideo({ seeking: true }))).toBe(true);
  });

  it('needs data ahead of the playhead while playing', () => {
    expect(isStalled(fakeVideo({ paused: false, readyState: 2 }))).toBe(true);
    expect(isStalled(fakeVideo({ paused: false, readyState: 3 }))).toBe(false);
  });

  it('only needs the current frame while paused', () => {
    expect(isStalled(fakeVideo({ paused: true, readyState: 1 }))).toBe(true);
    expect(isStalled(fakeVideo({ paused: true, readyState: 2 }))).toBe(false);
  });
});

describe('isActiveVideo', () => {
  it('is true only for the attached video of the current route', () => {
    const video = fakeVideo();
    attachVideo(video, route.fullname);
    expect(isActiveVideo(video, route)).toBe(true);
    expect(isActiveVideo(fakeVideo(), route)).toBe(false);
    expect(isActiveVideo(video, otherRoute)).toBe(false);
    expect(isActiveVideo(null, route)).toBe(false);
  });
});

describe('playbackRange', () => {
  it('uses the selected loop', () => {
    expect(playbackRange({ startTime: 120000, duration: 60000 }, { start: 0, end: 900000 })).toEqual({ start: 120000, end: 180000 });
  });

  it('handles a loop starting at the beginning of the route', () => {
    expect(playbackRange({ startTime: 0, duration: 60000 }, null)).toEqual({ start: 0, end: 60000 });
  });

  it('falls back to the zoomed range without a loop', () => {
    expect(playbackRange(null, { start: 0, end: 900000 })).toEqual({ start: 0, end: 900000 });
    expect(playbackRange({ startTime: 5, duration: 0 }, { start: 0, end: 10 })).toEqual({ start: 0, end: 10 });
  });

  it('is null with neither', () => {
    expect(playbackRange(null, null)).toBeNull();
    expect(playbackRange(null, { start: 10, end: 10 })).toBeNull();
  });
});
