import store from '../store';

let readVideoOffset;
let videoControls;

// RAF consumers read the media clock directly; Redux keeps event-driven snapshots.
export function registerPlaybackClock(readOffset, controls) {
  readVideoOffset = readOffset;
  videoControls = controls;
  return () => {
    if (readVideoOffset === readOffset) {
      readVideoOffset = undefined;
      videoControls = undefined;
    }
  };
}

// These calls stay inside the click gesture, including on iOS and in PWAs.
export function playVideo(speed) { videoControls?.play(speed); }
export function setVideoMuted(muted) { videoControls?.setMuted(muted); }

/** Current position in route-relative milliseconds, never extrapolated from wall time. */
export function currentOffset(state = store.getState()) {
  const videoOffset = readVideoOffset?.(state);
  if (!Number.isFinite(videoOffset)) return state.offset ?? state.loop?.startTime ?? 0;
  const start = state.loop?.startTime ?? 0;
  const end = state.loop ? start + state.loop.duration : Infinity;
  return Math.max(start, Math.min(end, videoOffset));
}
