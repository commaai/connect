import {
  correctedElementTime, isPlaybackProgress, isStallOver, playbackRateFor, shouldPositionOnReady,
} from './index';

describe('DriveVideo stall end', () => {
  it('seeked at readyState 3 does not clear', () => {
    // iPad native HLS: seeked and playing at readyState 3, currentTime frozen for 1.4s (back60) and 7s (fwd300)
    expect(isStallOver(3)).toBe(false);
    expect(isStallOver(2)).toBe(false);
    expect(isStallOver(1)).toBe(false);
  });

  it('seeked at readyState 4 clears', () => {
    expect(isStallOver(4)).toBe(true); // iPad fwd10 (inside the buffer): seeked at 66ms with readyState 4
  });

  it('canplaythrough clears', () => {
    // canplaythrough fires on the transition to HAVE_ENOUGH_DATA, so the handler always sees readyState 4
    expect(isStallOver(4)).toBe(true);
  });
});

describe('DriveVideo playback progress', () => {
  it('counts a normal 250ms step while playing', () => {
    expect(isPlaybackProgress(100, 100.25, false, 4)).toBe(true);
    expect(isPlaybackProgress(100, 100.25, false, 3)).toBe(true);
  });

  it('does not count the jump of our own seek', () => {
    expect(isPlaybackProgress(100, 400, false, 4)).toBe(false); // +300s right after `currentTime =`
    expect(isPlaybackProgress(100, 100.25, true, 4)).toBe(false); // element still seeking
    expect(isPlaybackProgress(100, 100.25, false, 2)).toBe(false); // no data at the new position yet
  });

  it('does not count a backward step (loop wrap)', () => {
    expect(isPlaybackProgress(100, 40, false, 4)).toBe(false);
    expect(isPlaybackProgress(100, 100, false, 4)).toBe(false); // frozen (iPad at readyState 3 after seeked)
  });

  it('needs a previous tick to compare against', () => {
    expect(isPlaybackProgress(null, 100.25, false, 4)).toBe(false);
  });

  it('scales the step bound with the playback rate', () => {
    expect(isPlaybackProgress(100, 102, false, 4, 8)).toBe(true); // 8x: 2s per 250ms tick
    expect(isPlaybackProgress(100, 102, false, 4, 1)).toBe(false);
    expect(isPlaybackProgress(100, 400, false, 4, 8)).toBe(false); // a seek is still a seek at 8x
    expect(isPlaybackProgress(100, 100.1, false, 4, 0.5)).toBe(true); // slow rates keep the rate-1 bound
  });
});

describe('DriveVideo playback rate', () => {
  it('caps native HLS at 2x and never writes 0', () => {
    expect(playbackRateFor(4, true)).toBe(2);
    expect(playbackRateFor(8, true)).toBe(2);
    expect(playbackRateFor(2, true)).toBe(2);
    expect(playbackRateFor(0.5, true)).toBe(0.5);
    expect(playbackRateFor(4, false)).toBe(4);
    expect(playbackRateFor(4, null)).toBe(4); // no element attached yet: no cap
    expect(playbackRateFor(0, true)).toBe(1); // paused: the element is paused by `playing`, not by rate 0
    expect(playbackRateFor(0, false)).toBe(1);
  });
});

describe('DriveVideo late videoStartOffset', () => {
  it('moves the element back when the offset arrives after it was positioned', () => {
    // seeked to route offset 12000 with the offset unknown, 500ms of first-frame offset lands later
    expect(correctedElementTime(12, null, 500)).toBe(11.5);
    expect(correctedElementTime(12, undefined, 500)).toBe(11.5);
    expect(correctedElementTime(0.2, null, 500)).toBe(0); // clamped at the start of the video
  });

  it('is a no-op when the offset was already known when the element was positioned', () => {
    expect(correctedElementTime(12, 500, 500)).toBeNull();
    expect(correctedElementTime(12, null, null)).toBeNull();
    expect(correctedElementTime(12, undefined, null)).toBeNull(); // no first frame event, nothing to correct
  });

  it('applies the same shift after a user seek, which was also computed with the stale offset', () => {
    // the seek wrote (200000 - 0) / 1000; with the offset known it should have been (200000 - 500) / 1000
    expect(correctedElementTime(200, null, 500)).toBe(199.5);
  });

  it('shifts by the difference when the offset changes from one number to another', () => {
    expect(correctedElementTime(12, 300, 500)).toBeCloseTo(11.8, 6);
    expect(correctedElementTime(12, 500, 300)).toBeCloseTo(12.2, 6);
  });
});

describe('DriveVideo ready positioning', () => {
  const a = 'https://api.comma.ai/v1/route/a/qcamera.m3u8';
  const b = 'https://api.comma.ai/v1/route/b/qcamera.m3u8';

  it('positions on the first ready for a source', () => {
    expect(shouldPositionOnReady(null, a)).toBe(true);
  });

  it('does not position again on a later ready for the same source', () => {
    // iPad toStart: Safari fires `canplay` after each cold seek, react-player forwards each as onReady
    expect(shouldPositionOnReady(a, a)).toBe(false);
  });

  it('positions again once the source changed', () => {
    expect(shouldPositionOnReady(a, b)).toBe(true);
    expect(shouldPositionOnReady(a, null)).toBe(false); // back to the same route: updateVideoSource resets to null
    expect(shouldPositionOnReady(null, a)).toBe(true);
  });

  it('has nothing to position without a source', () => {
    expect(shouldPositionOnReady(null, '')).toBe(false);
    expect(shouldPositionOnReady(null, null)).toBe(false);
  });
});
