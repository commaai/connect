// Mapping between the video element's clock (seconds from the start of the
// qcamera stream) and the timeline's route offset (milliseconds from the
// start of the route). The stream starts at the route's first road camera
// frame, so everything before that has no video and the timeline simply runs
// ahead until it catches up.

// where the video element currently is on the route timeline, in ms
export function videoOffsetMs(video, videoStartOffset) {
  return video.currentTime * 1000 + videoStartOffset;
}

// where a route offset lives inside the video stream, in seconds
export function videoSecondsForOffset(offsetMs, videoStartOffset) {
  return (offsetMs - videoStartOffset) / 1000;
}

// Browsers never play faster than 16x, and Firefox mutes audio above 8x.
export function playbackRateFor(desiredPlaySpeed, { muted, isFirefox }) {
  return Math.min(desiredPlaySpeed, isFirefox && !muted ? 8 : 16);
}

// Where the video should seek so that it lines up with the timeline again,
// or null when it's close enough. The video normally drives the timeline, so
// this only fires when something commanded a new position (a user seek, a
// new source) or when the loop wraps around.
export function seekTargetMs({ timelineMs, videoMs, loop, playSpeed }) {
  if (loop && loop.duration > 0) {
    const loopEnd = loop.startTime + loop.duration;
    if (videoMs >= loopEnd) {
      // the timeline has wrapped; take the video with it
      return loop.startTime + ((videoMs - loop.startTime) % loop.duration);
    }
    if (videoMs < loop.startTime) {
      return loop.startTime;
    }
  }

  // a generous threshold: small differences are just clock skew between the
  // extrapolated timeline and the video, which the next syncPlayback resolves
  const threshold = Math.max(500, 500 * playSpeed);
  if (Math.abs(timelineMs - videoMs) > threshold) {
    return timelineMs;
  }
  return null;
}
