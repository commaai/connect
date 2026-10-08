// The drive's <video> is the playback clock. The timeline, map and time display read
// the playhead from it every frame, and seeking moves the video itself. Until the
// video can report a time (before it loads, or when the drive has no video), the
// playhead stays where it was last put.
const clock = {
  video: null,
  videoStart: 0, // ms into the route of the video's first frame
  offset: 0, // ms into the route, where the playhead was last put
};

const hasTime = (video) => video?.readyState > 0;

export function attachVideo(video, videoStart = 0) {
  clock.video = video;
  clock.videoStart = videoStart;
}

// Past the end of a video that is still uploading, the playhead stays where it was put.
export function isPastVideoEnd() {
  const { video, videoStart, offset } = clock;
  return hasTime(video) && video.currentTime >= video.duration && offset > videoStart + (video.duration * 1000);
}

export function currentOffset() {
  const { video, videoStart, offset } = clock;
  return hasTime(video) && !isPastVideoEnd() ? videoStart + (video.currentTime * 1000) : offset;
}

// Puts the playhead at an offset into the route, in milliseconds.
export function moveTo(offset) {
  const { video, videoStart } = clock;
  clock.offset = offset;
  if (hasTime(video)) {
    video.currentTime = Math.max(0, (offset - videoStart) / 1000);
  }
}

// The video time the playhead was put at, for a video that is still loading.
export function pendingVideoTime() {
  return Math.max(0, (clock.offset - clock.videoStart) / 1000);
}
