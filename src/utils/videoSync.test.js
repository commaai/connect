import { describe, expect, it } from 'vitest';

import { resolveSync, clampPlaybackRate, MAX_PLAYBACK_RATE, FIREFOX_AUDIO_PLAYBACK_RATE } from './videoSync';

describe('resolveSync', () => {
  const base = {
    desiredPlaySpeed: 1, desiredVideoTime: 10, currentVideoTime: 10, duration: 60, isIos: false,
  };

  it('nudges the rate up when the video lags within tolerance', () => {
    // 0.2s behind, playing at 1x -> nudge rate up by 0.2
    const { action, playbackRate } = resolveSync({ ...base, currentVideoTime: 9.8 });
    expect(action).toBe('nudge');
    expect(playbackRate).toBeCloseTo(1.2);
  });

  it('nudges the rate down when the video runs ahead within tolerance', () => {
    const { action, playbackRate } = resolveSync({ ...base, currentVideoTime: 10.3 });
    expect(action).toBe('nudge');
    expect(playbackRate).toBeCloseTo(0.7);
  });

  it('does not adjust the rate on iOS (unreliable), but still nudges', () => {
    const { action, playbackRate } = resolveSync({ ...base, currentVideoTime: 9.8, isIos: true });
    expect(action).toBe('nudge');
    expect(playbackRate).toBe(1); // unchanged
  });

  it('seeks when the gap exceeds tolerance', () => {
    const { action } = resolveSync({ ...base, currentVideoTime: 5 });
    expect(action).toBe('seek');
  });

  it('uses skip-to-zero when the target is 0 and the video starts later', () => {
    // desired 0, current 3, duration 60 -> advance timeline, not seek video
    const { action } = resolveSync({ ...base, desiredVideoTime: 0, currentVideoTime: 3 });
    expect(action).toBe('skip-to-zero');
  });

  it('does not skip-to-zero when the current time already equals duration', () => {
    // edge case from the component: currentVideoTime === duration means don't skip
    const { action } = resolveSync({
      ...base, desiredVideoTime: 0, currentVideoTime: 60, duration: 60,
    });
    expect(action).toBe('seek');
  });

  it('floors the nudge tolerance at 0.1s when paused (rate 0)', () => {
    // paused: rate 0 -> tolerance 0.1; 0.05s drift still nudges (no seek)
    const { action } = resolveSync({
      ...base, desiredPlaySpeed: 0, currentVideoTime: 9.95,
    });
    expect(action).toBe('nudge');
  });

  it('seeks when paused and drift exceeds the 0.1s floor', () => {
    const { action } = resolveSync({
      ...base, desiredPlaySpeed: 0, currentVideoTime: 9.5,
    });
    expect(action).toBe('seek');
  });
});

describe('clampPlaybackRate', () => {
  it('caps at 16x normally', () => {
    expect(clampPlaybackRate(20, false, false)).toBe(MAX_PLAYBACK_RATE);
  });

  it('caps at 8x on Firefox when audio is on', () => {
    expect(clampPlaybackRate(12, true, false)).toBe(FIREFOX_AUDIO_PLAYBACK_RATE);
  });

  it('allows 16x on Firefox when muted', () => {
    expect(clampPlaybackRate(12, true, true)).toBe(12);
  });

  it('never goes negative', () => {
    expect(clampPlaybackRate(-3, false, false)).toBe(0);
  });
});
