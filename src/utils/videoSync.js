// Pure decision logic for keeping the video element's playback position in
// sync with the timeline. Kept separate from DriveVideo so the seek/nudge
// rules can be unit-tested without a real <video> or hls.js instance.

export const MAX_PLAYBACK_RATE = 16;
export const FIREFOX_AUDIO_PLAYBACK_RATE = 8; // Firefox mutes audio above 8x

/**
 * Decide how to resync the video to the desired timeline position.
 *
 * When the video is within a small tolerance of the target we nudge its
 * playback rate to close the gap (cheap, no seek). Larger gaps need a real
 * seek; if the target is timestamp 0 while the video starts later we instead
 * advance the timeline to meet the video (logs can start before video).
 *
 * @param {object} args
 * @param {number} args.desiredPlaySpeed - the user's chosen speed (0 when paused)
 * @param {number} args.desiredVideoTime - target position, in seconds
 * @param {number} args.currentVideoTime - the element's current position, in seconds
 * @param {number} args.duration - the element's total duration, in seconds
 * @param {boolean} args.isIos - iOS nudges playback rate unreliably, so skip it
 * @returns {{ action: 'nudge'|'skip-to-zero'|'seek', playbackRate: number }}
 */
export function resolveSync({
  desiredPlaySpeed, desiredVideoTime, currentVideoTime, duration, isIos,
}) {
  const timeDiff = desiredVideoTime - currentVideoTime;
  let playbackRate = desiredPlaySpeed;

  let action;
  // Tolerance scales with speed; floor at 0.1s so a paused (rate 0) video
  // still nudges for tiny drift instead of seeking.
  if (Math.abs(timeDiff) <= Math.max(0.1, 0.5 * desiredPlaySpeed)) {
    action = 'nudge';
    if (!isIos) {
      playbackRate = Math.max(0, playbackRate + Math.round(timeDiff * 10) / 10);
    }
  } else if (desiredVideoTime === 0 && timeDiff < 0 && currentVideoTime !== duration) {
    action = 'skip-to-zero';
  } else {
    action = 'seek';
  }

  return { action, playbackRate };
}

/**
 * Clamp a playback rate to what browsers actually support.
 *
 * @param {number} playbackRate
 * @param {boolean} isFirefox
 * @param {boolean} isMuted - Firefox only mutes above 8x when audio is on
 * @returns {number}
 */
export function clampPlaybackRate(playbackRate, isFirefox, isMuted) {
  const max = isFirefox && !isMuted ? FIREFOX_AUDIO_PLAYBACK_RATE : MAX_PLAYBACK_RATE;
  return Math.max(0, Math.min(max, playbackRate));
}
