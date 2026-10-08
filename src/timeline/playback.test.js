import { vi } from 'vitest';
import * as Types from '../actions/types';
import { currentOffset, setVideo } from '.';
import { pause, play, reducer, restoreOffset, seek, selectLoop, videoStateChanged } from './playback';

function makeVideo(props = {}) {
  return {
    readyState: HTMLMediaElement.HAVE_ENOUGH_DATA,
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    ...props,
  };
}

// run a thunk against a fixed state and collect the actions it dispatches
function run(thunk, state) {
  const actions = [];
  thunk((action) => actions.push(action), () => state);
  return actions;
}

const route = { videoStartOffset: 2000 };

describe('playback', () => {
  afterEach(() => setVideo(null));

  it('reads the position from the video', () => {
    const video = makeVideo({ currentTime: 10 });
    setVideo(video);
    expect(currentOffset({ currentRoute: route, offset: 0 })).toEqual(12000);

    // until it has loaded, the last seek stands in
    video.readyState = HTMLMediaElement.HAVE_NOTHING;
    expect(currentOffset({ currentRoute: route, offset: 5000 })).toEqual(5000);
    expect(currentOffset({ currentRoute: route, offset: null, loop: { startTime: 3000, duration: 1000 } })).toEqual(3000);
  });

  it('seeks the video', () => {
    const video = makeVideo();
    setVideo(video);
    const actions = run(seek(32000), { currentRoute: route });
    expect(video.currentTime).toEqual(30);
    expect(actions).toEqual([{ type: Types.ACTION_SEEK, offset: 32000 }]);
    expect(reducer({}, actions[0]).offset).toEqual(32000);
  });

  it('keeps seeks inside the selection and after the first video frame', () => {
    const video = makeVideo();
    setVideo(video);
    const loop = { startTime: 10000, duration: 10000 };
    expect(run(seek(30000), { currentRoute: route, loop })[0].offset).toEqual(20000);
    expect(run(seek(0), { currentRoute: route, loop })[0].offset).toEqual(10000);
    expect(run(seek(0), { currentRoute: route })[0].offset).toEqual(2000);
    expect(video.currentTime).toEqual(0);
  });

  it('applies a seek made while loading once the video has loaded', () => {
    const video = makeVideo({ readyState: HTMLMediaElement.HAVE_NOTHING });
    setVideo(video);
    const [action] = run(seek(42000), { currentRoute: route });
    expect(video.currentTime).toEqual(0);

    video.readyState = HTMLMediaElement.HAVE_METADATA;
    run(restoreOffset(), reducer({ currentRoute: route }, action));
    expect(video.currentTime).toEqual(40);
  });

  it('plays and pauses the video, which reports back', () => {
    const video = makeVideo();
    setVideo(video);

    run(play(2), {});
    expect(video.play).toHaveBeenCalled();
    expect(video.playbackRate).toEqual(2);

    run(pause(), {});
    expect(video.pause).toHaveBeenCalled();

    const state = reducer({}, videoStateChanged(makeVideo({ paused: false, playbackRate: 2 })));
    expect(state).toEqual({ isPlaying: true, playSpeed: 2 });
  });

  it('selects and clears a loop', () => {
    let state = reducer({}, selectLoop(1000, 3000));
    expect(state.loop).toEqual({ startTime: 1000, duration: 2000 });
    state = reducer(state, selectLoop(null, null));
    expect(state.loop).toBeNull();
  });
});
