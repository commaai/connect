// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';

/**
 * Constrain an offset to the active loop range.
 *
 * The published video position wraps around instead of running past the end of
 * the loop, which is what makes the video element loop without any timer math.
 *
 * Defined here rather than imported from '../timeline' on purpose: that module
 * imports the store, which imports the reducers, which import this one.
 *
 * @param {number} offset - offset in milliseconds
 * @param {object} loop - `{ startTime, duration }` or null
 * @returns {number} the normalized offset
 */
export function normalizeLoopOffset(offset, loop) {
  if (offset === null || !loop?.startTime) {
    return offset;
  }

  const loopStart = loop.startTime;
  if (offset < loopStart) {
    return loopStart;
  }
  if (offset >= loopStart + loop.duration) {
    return ((offset - loopStart) % loop.duration) + loopStart;
  }
  return offset;
}

export function reducer(_state, action) {
  let state = { ..._state };
  let loopOffset = null;
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime;
  }
  switch (action.type) {
    case Types.ACTION_SEEK:
      // the offset is applied immediately, DriveVideo signals the <video>
      // element to catch up
      state = {
        ...state,
        offset: action.offset,
      };

      if (loopOffset !== null) {
        if (state.offset < loopOffset) {
          state.offset = loopOffset;
        } else if (state.offset > (loopOffset + state.loop.duration)) {
          state.offset = loopOffset + state.loop.duration;
        }
      }
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
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
      };
      break;
    case Types.ACTION_VIDEO_PROGRESS:
      // the video element is the authority on where we are; mirror it
      state = {
        ...state,
        offset: action.offset,
      };
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
      };
      break;
    default:
      break;
  }

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

  // the video element wraps around at the loop end, so a position it publishes
  // past the end comes back around to the start. A user-requested seek has
  // already been clamped above and must never wrap -- it would jump the user
  // back to the loop start instead of holding at the end.
  if (action.type !== Types.ACTION_SEEK) {
    state.offset = normalizeLoopOffset(state.offset, state.loop);
  }

  state.isBufferingVideo = Boolean(state.isBufferingVideo);

  return state;
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
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

// the <video> element reporting its own position (in milliseconds)
export function videoProgress(offset) {
  return {
    type: Types.ACTION_VIDEO_PROGRESS,
    offset,
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
