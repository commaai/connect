// The drive's <video> element is the playback clock. The timeline, time
// display and map read the playhead from it, and every seek is applied to it,
// so there is never a second clock to keep in sync.
//
// Offsets are route offsets in milliseconds. The video starts at the route's
// first camera frame, `videoStartOffset` milliseconds into the route.

const clock = {
  video: null,
  videoStartOffset: 0,
  range: null,         // { start, end } the playhead is kept within
  pendingOffset: null, // a seek requested before the video could take it
};

function canSeek() {
  return clock.video !== null && clock.video.readyState >= HTMLMediaElement.HAVE_METADATA;
}

// Called by DriveVideo whenever its element, route or selected range changes.
export function attachVideo(video, videoStartOffset = 0, range = null) {
  if (video !== clock.video) {
    clock.pendingOffset = null;
  }
  clock.video = video;
  clock.videoStartOffset = videoStartOffset;
  clock.range = range;
}

/**
 * Get current playback offset
 *
 * @returns {number}
 */
export function currentOffset() {
  if (clock.pendingOffset !== null || !canSeek()) {
    return clock.pendingOffset ?? clock.range?.start ?? 0;
  }
  return (clock.video.currentTime * 1000) + clock.videoStartOffset;
}

// Moves the playhead, clamped to the selected range. Before the video has
// loaded, the seek is held and applied by resumePosition().
export function seekTo(offset) {
  if (clock.range) {
    offset = Math.min(Math.max(offset, clock.range.start), clock.range.end);
  }
  if (canSeek()) {
    clock.pendingOffset = null;
    clock.video.currentTime = Math.max(0, (offset - clock.videoStartOffset) / 1000);
  } else {
    clock.pendingOffset = offset;
  }
}

// Called once the video has metadata: moves it to the offset the clock has
// been reporting while it loaded.
export function resumePosition() {
  seekTo(clock.pendingOffset ?? clock.range?.start ?? 0);
}

export function getVideo() {
  return clock.video;
}
