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

// whether the attached element plays the m3u8 itself (Safari, iOS) rather than through hls.js, which always feeds it
// a MediaSource blob: URL. Decided from the element, not the user agent (an iPad sends a desktop UA). null while no
// element is attached or it has no source yet, so callers can fall back to a UA guess
export function isNativeHls() {
  if (!video || !video.currentSrc) {
    return null;
  }
  return !video.currentSrc.startsWith('blob:');
}

// route offset of the video clock in ms, or null when there is no element or it has no metadata yet
export function videoOffsetMs(route) {
  if (!video || video.readyState < 1) {
    return null;
  }
  return (video.currentTime * 1000) + (route?.videoStartOffset || 0);
}
