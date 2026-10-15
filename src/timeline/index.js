import store from '../store';

let readVideoOffset = null;
let playbackControls = null;

// Animation consumers can read the media clock directly without rerendering the
// entire Redux tree for every frame. Redux retains the last media event snapshot.
export function registerVideoClock(readOffset, controls) {
  readVideoOffset = readOffset;
  playbackControls = controls;
  return () => {
    if (readVideoOffset === readOffset) {
      readVideoOffset = null;
      playbackControls = null;
    }
  };
}

// External controls must reach the element during the user gesture on iOS.
export function requestVideoPlay(speed) {
  playbackControls?.play(speed);
}

export function setVideoMuted(muted) {
  playbackControls?.setMuted(muted);
}

export function currentOffset(state = null) {
  if (!state) {
    const videoOffset = readVideoOffset?.();
    if (Number.isFinite(videoOffset)) return videoOffset;
    state = store.getState();
  }
  return state.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
