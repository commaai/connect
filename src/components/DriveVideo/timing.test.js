import {
  playbackRateFor, seekTargetMs, videoOffsetMs, videoSecondsForOffset,
} from './timing';

describe('DriveVideo timing', () => {
  it('maps between the video clock and route offsets', () => {
    const video = { currentTime: 12.5 };
    expect(videoOffsetMs(video, 0)).toEqual(12500);
    expect(videoOffsetMs(video, 3000)).toEqual(15500);
    expect(videoSecondsForOffset(15500, 3000)).toEqual(12.5);
    expect(videoSecondsForOffset(0, 0)).toEqual(0);
  });

  it('caps playback speed to what browsers handle', () => {
    expect(playbackRateFor(1, { muted: true, isFirefox: false })).toEqual(1);
    expect(playbackRateFor(16, { muted: true, isFirefox: false })).toEqual(16);
    // firefox mutes audio above 8x, so never go faster while unmuted
    expect(playbackRateFor(16, { muted: false, isFirefox: true })).toEqual(8);
    expect(playbackRateFor(16, { muted: true, isFirefox: true })).toEqual(16);
  });

  it('leaves the video alone while it is close to the timeline', () => {
    expect(seekTargetMs({
      timelineMs: 10000, videoMs: 9800, loop: null, playSpeed: 1,
    })).toBeNull();
    // even a paused video only needs a nudge, the sync closes small gaps
    expect(seekTargetMs({
      timelineMs: 10000, videoMs: 9700, loop: null, playSpeed: 0,
    })).toBeNull();
  });

  it('seeks the video when the timeline was commanded somewhere else', () => {
    expect(seekTargetMs({
      timelineMs: 60000, videoMs: 10000, loop: null, playSpeed: 1,
    })).toEqual(60000);
    expect(seekTargetMs({
      timelineMs: 0, videoMs: 55000, loop: null, playSpeed: 1,
    })).toEqual(0);
  });

  it('takes the video around the loop when the timeline wraps', () => {
    const loop = { startTime: 10000, duration: 20000 };
    // played past the end of the loop
    expect(seekTargetMs({
      timelineMs: 10500, videoMs: 31500, loop, playSpeed: 1,
    })).toEqual(11500);
    // landed before the loop starts
    expect(seekTargetMs({
      timelineMs: 10000, videoMs: 5000, loop, playSpeed: 1,
    })).toEqual(10000);
    // inside the loop nothing moves
    expect(seekTargetMs({
      timelineMs: 15000, videoMs: 15200, loop, playSpeed: 1,
    })).toBeNull();
  });
});
