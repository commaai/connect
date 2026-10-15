// Pure classification of video playback errors into a user-facing message.
// Kept separate from the DriveVideo component so every edge case can be
// unit-tested without a real <video> element or hls.js instance.

export const SEGMENT_MISSING = 'This video segment has not uploaded yet or has been deleted.';
export const LOAD_FAILED = 'Unable to load video';
export const NETWORK_FAILED = 'Unable to load video. Check network connection.';

/**
 * Classify an hls.js error (arrives via ReactPlayer's onError as ('hlsError', data)).
 *
 * @param {object} e - the hls.js error data
 * @returns {string|null} message to show, or null when this is just buffering (not an error)
 */
export function hlsErrorMessage(e) {
  // Transient buffer stalls are not errors; the player recovers on its own.
  if (e?.type === 'mediaError'
    && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
    return null;
  }
  if (e?.type === 'networkError' && e.response?.code === 404) {
    return SEGMENT_MISSING;
  }
  return LOAD_FAILED;
}

/**
 * Classify a native media-element error.
 *
 * @param {object} e - the error (or the string 'hlsError', handled by the caller)
 * @param {string} [origin] - window.location.origin, used to detect the ".../undefined" src bug
 * @returns {string|null} message to show, or null when the error should be ignored
 */
export function videoErrorMessage(e, origin = '') {
  if (!e || e === 'hlsError' || e.name === 'AbortError') {
    return null;
  }

  // Sometimes an error fires because we try to play ".../undefined"; not a real failure.
  const src = e.target?.src;
  if (src?.startsWith(origin) && src.endsWith('undefined')) {
    return null;
  }

  if (e.type === 'networkError') {
    return NETWORK_FAILED;
  }
  if (e.response?.code === 404) {
    return SEGMENT_MISSING;
  }
  return e.response?.text || LOAD_FAILED;
}
