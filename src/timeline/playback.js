// Playback intent reducer.
//
// Under the "video drives state" architecture this reducer stores *intent*
// (desired speed, desired seek target) and *status* (buffering), never a
// virtual clock. The <video> element reports its live position back via
// ACTION_VIDEO_TIME, and currentOffset() reads the element directly for
// smoothness. `startTime` is kept only as a monotonically-updated seek token
// so consumers can detect a user-initiated jump (e.g. the map re-centering).
import * as Types from '../actions/types';
import { currentOffset, wrapLoop } from '.';

export function reducer(_state, action) {
  let state = { ..._state };

  switch (action.type) {
    case Types.ACTION_SEEK:
      // user (or code) requested a jump. Store the target and bump the seek
      // token so the video seeks there and map/consumers re-center.
      state = {
        ...state,
        offset: wrapLoop(action.offset, state.loop),
        startTime: Date.now(),
      };
      break;
    case Types.ACTION_VIDEO_TIME:
      // the video reporting its authoritative position. No token bump: this is
      // not a user seek, just the clock advancing.
      state = {
        ...state,
        offset: wrapLoop(action.offset, state.loop),
      };
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: currentOffset(state),
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
          offset: currentOffset(state),
          desiredPlaySpeed: action.speed,
        };
      }
      break;
    case Types.ACTION_LOOP:
      if (action.start !== null && action.start !== undefined && action.end !== null && action.end !== undefined) {
        state.loop = {
          startTime: action.start,
          duration: action.end - action.start,
        };
      } else {
        state.loop = null;
      }
      break;
    case Types.ACTION_BUFFER_VIDEO:
      state = {
        ...state,
        isBufferingVideo: action.buffering,
        offset: currentOffset(state),
      };
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
        startTime: Date.now(),
      };
      break;
    default:
      break;
  }

  // keep a loop that starts at the very beginning aligned with the first
  // available video frame (videoStartOffset), so playback can't sit on a
  // segment that has no video.
  if (state.currentRoute && state.currentRoute.videoStartOffset && state.loop && state.zoom
    && state.loop.startTime === state.zoom.start && state.zoom.start === 0) {
    const loopRouteOffset = state.loop.startTime - state.zoom.start;
    if (state.currentRoute.videoStartOffset > loopRouteOffset) {
      state.loop = {
        startTime: state.zoom.start + state.currentRoute.videoStartOffset,
        duration: state.loop.duration - (state.currentRoute.videoStartOffset - loopRouteOffset),
      };
    }
  }

  // keep the stored offset inside the loop bounds
  if (state.offset !== null && state.loop?.startTime) {
    state.offset = wrapLoop(state.offset, state.loop);
  }

  state.isBufferingVideo = Boolean(state.isBufferingVideo);

  return state;
}

// seek to a specific offset (user-initiated jump; bumps the seek token)
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset,
  };
}

// report the authoritative position from the <video> element (no token bump)
export function videoTime(offset) {
  return {
    type: Types.ACTION_VIDEO_TIME,
    offset,
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE,
  };
}

// resume / change play speed
export function play(speed = 1) {
  return {
    type: Types.ACTION_PLAY,
    speed,
  };
}

export function selectLoop(start, end) {
  return {
    type: Types.ACTION_LOOP,
    start,
    end,
  };
}

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
