import { currentOffset } from '.';
import { bindVideo } from './video';
import { bufferVideo, pause, play, reducer, seek, selectionHasVideo, selectLoop } from './playback';

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
  afterEach(() => bindVideo(null));

  it('does not move the playhead when speed or buffering changes', () => {
    let next = reducer(state({ offset: 50 }), pause());
    next = reducer(next, play(2));
    next = reducer(next, bufferVideo(true));
    expect(next.offset).toBe(50);
  });

  it('clamps a seek into the loop', () => {
    const next = reducer(state(), selectLoop(1000, 2000));
    expect(reducer(next, seek(3000)).offset).toBe(2000);
    expect(reducer(next, seek(0)).offset).toBe(1000);
  });

  it('reads the video, and wraps a stored offset into the loop', () => {
    bindVideo({ currentTime: 2, readyState: 1 });
    expect(currentOffset(state({
      currentRoute: { videoStartOffset: 500 },
      offset: 0,
    }))).toBe(2500);

    bindVideo(null);
    expect(currentOffset(state({
      offset: 2500,
      loop: { startTime: 1000, duration: 1000 },
    }))).toBe(1500);
  });

  it('notices a selection that misses the video', () => {
    const route = { events: [], videoStartOffset: 5000, duration: 10000 };
    expect(selectionHasVideo(route, { startTime: 0, duration: 1000 })).toBe(false);
    expect(selectionHasVideo(route, { startTime: 6000, duration: 1000 })).toBe(true);
    expect(selectionHasVideo(route, { startTime: 6000, duration: 0 })).toBe(true);
    expect(selectionHasVideo(route, null)).toBe(true);
    expect(selectionHasVideo({ events: [], videoStartOffset: null, duration: 10000 }, null)).toBe(false);
    expect(selectionHasVideo({ duration: 10000 }, null)).toBe(true);
  });
});
