import { currentOffset } from '.';
import { bindVideo } from './video';
import { bufferVideo, pause, play, reducer, seek, selectLoop } from './playback';

function state(overrides) {
  return {
    desiredPlaySpeed: 1,
    offset: 0,
    isBufferingVideo: false,
    loop: null,
    ...overrides,
  };
}

describe('playback', () => {
  it('records speed without moving the playhead', () => {
    let next = reducer(state({ offset: 50 }), pause());
    expect(next.desiredPlaySpeed).toBe(0);
    expect(next.offset).toBe(50);

    next = reducer(next, play(0.5));
    expect(next.desiredPlaySpeed).toBe(0.5);
    expect(next.offset).toBe(50);

    next = reducer(next, bufferVideo(true));
    expect(next.isBufferingVideo).toBe(true);
    expect(next.offset).toBe(50);
    expect(next.desiredPlaySpeed).toBe(0.5);
  });

  it('clamps seeks into the loop', () => {
    let next = reducer(state(), selectLoop(1000, 2000));
    expect(next.loop).toEqual({ startTime: 1000, duration: 1000 });

    next = reducer(next, seek(3000));
    expect(next.offset).toBe(2000);

    next = reducer(next, seek(0));
    expect(next.offset).toBe(1000);
  });
});

describe('currentOffset', () => {
  afterEach(() => bindVideo(null));

  it('reads the video element', () => {
    bindVideo({ currentTime: 2, readyState: 1 });
    const offset = currentOffset(state({
      currentRoute: { videoStartOffset: 500 },
      offset: 0,
    }));
    expect(offset).toBe(2500);
  });

  it('uses the stored offset until the video has a frame', () => {
    const offset = currentOffset(state({
      offset: 40,
      loop: { startTime: 10, duration: 5 },
    }));
    expect(offset).toBe(10);
  });
});
