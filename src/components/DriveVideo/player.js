// What the drive video needs to know about itself, kept apart from React so it can be tested alone.

export const HAVE_METADATA = 1;
export const HAVE_CURRENT_DATA = 2;
export const HAVE_FUTURE_DATA = 3;

export const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
export const NETWORK_ERROR = 'Unable to load video. Check network connection.';
export const GENERIC_ERROR = 'Unable to load video';
export const UNSUPPORTED = 'This browser cannot play this video.';

const MEDIA_ERR_NETWORK = 2;

/** Browsers don't play much faster than 16x, and Firefox mutes audio above 8x. */
export function maxPlaybackRate({ muted, firefox }) {
  return firefox && !muted ? 8 : 16;
}

const MIN_BUFFER_LEAD = 10;

/**
 * How many seconds of video to keep loaded ahead of the playhead.
 *
 * Segments are a minute long, so loading the next one as soon as the current one arrives means that
 * a seek usually cancels it, and a cancelled download costs the connection: the segment the seek
 * actually needs then takes several times as long. Waiting until the end of a segment is near avoids
 * that. At speed, though, the end of a segment comes round faster than one can be fetched, so
 * allow a few seconds of fetching, in real time.
 */
export function bufferLead(speed) {
  return Math.max(MIN_BUFFER_LEAD, 4 * speed);
}

/** Seconds into the video for a playhead offset, given how far into the route the video starts. */
export function videoTime(offset, videoStartOffset = 0) {
  return Math.max(0, (offset - videoStartOffset) / 1000);
}

/**
 * Whether the video is waiting for data it needs. A paused video that has its current frame is
 * not waiting, whatever else it has buffered.
 */
export function isBuffering(video) {
  if (video.error) {
    return false;
  }
  if (video.paused && video.readyState >= HAVE_CURRENT_DATA) {
    return false;
  }
  return video.readyState < HAVE_FUTURE_DATA;
}

/** Where to jump back to if playing has run off the end of the loop, or null if it hasn't. */
export function loopRestartOffset(offset, loop) {
  if (!loop?.startTime || !loop.duration) {
    return null; // same rule as currentOffset: a loop that starts at 0 plays through
  }
  return offset >= loop.startTime + loop.duration ? loop.startTime : null;
}

/** @param {{ type?: string, response?: { code?: number } }} data an hls.js error event */
export function hlsErrorMessage(data) {
  if (data.response?.code === 404) {
    return NOT_UPLOADED;
  }
  return data.type === 'networkError' ? NETWORK_ERROR : GENERIC_ERROR;
}

/** @param {MediaError | null} error from the video element itself, as native HLS reports them */
export function mediaErrorMessage(error) {
  return error?.code === MEDIA_ERR_NETWORK ? NETWORK_ERROR : GENERIC_ERROR;
}

/**
 * Do what the user asked of the video: play at a speed, or pause.
 *
 * @param {HTMLVideoElement} video
 * @param {{ speed: number, muted: boolean, firefox: boolean }} intent
 * @param {() => void} onBlocked called if the browser refuses to start playing without a tap
 */
export function applyIntent(video, { speed, muted, firefox }, onBlocked) {
  if (speed > 0) {
    video.playbackRate = Math.min(speed, maxPlaybackRate({ muted, firefox }));
    if (video.paused) {
      video.play()?.catch((err) => {
        if (err.name === 'NotAllowedError') {
          onBlocked();
        }
      });
    }
  } else if (!video.paused) {
    video.pause();
  }
}
