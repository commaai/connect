import * as Types from '../actions/types';
import { attachVideo, detachVideo, seekVideo, videoMiddleware, videoOffset } from './video';

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
