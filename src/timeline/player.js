// The drive's <video> element is the playback clock. DriveVideo attaches it
// once the video and its playlist are loaded; from then on currentOffset()
// reads it and the playback actions command it, like any video player.
import { offsetToVideoTime, videoTimeToOffset } from './video';

let player = null;

export function attachPlayer(video, segments, videoStartOffset) {
  player = { video, segments, videoStartOffset };
}

export function detachPlayer(video) {
  if (player?.video === video) {
    player = null;
  }
}

/** @returns {number|null} the video's offset, or null without a video */
export function playerOffset() {
  if (!player) {
    return null;
  }
  const { video, segments, videoStartOffset } = player;
  return videoTimeToOffset(segments, videoStartOffset, video.currentTime);
}

export function seekPlayer(offset) {
  if (player) {
    const { video, segments, videoStartOffset } = player;
    video.currentTime = offsetToVideoTime(segments, videoStartOffset, offset);
  }
}

/** @returns {Promise} rejects if the browser doesn't allow playing */
export async function playPlayer(speed) {
  if (player) {
    player.video.playbackRate = speed;
    if (player.video.paused) {
      await player.video.play();
    }
  }
}

export function pausePlayer() {
  player?.video.pause();
}
