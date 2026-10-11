// the <video> element is the playback clock; this module hands it to whoever needs to read it
let video = null;

export function attachVideo(el) {
  video = el || null;
}

// only detaches if `el` is the element currently attached
export function detachVideo(el) {
  if (video === el) {
    video = null;
  }
}

export function getVideo() {
  return video;
}

// route offset of the video clock in ms, or null when there is no element or it has no metadata yet
export function videoOffsetMs(route) {
  if (!video || video.readyState < 1) {
    return null;
  }
  return (video.currentTime * 1000) + (route?.videoStartOffset || 0);
}
