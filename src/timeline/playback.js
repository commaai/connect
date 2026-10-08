// Playback state. The <video> element owns the position; these actions either
// record what the video reported (ACTION_VIDEO_TIME) or are user intent that the
// player turns into a command (seek/pause/play).
import * as Types from '../actions/types';
import { getVideo } from '.';

export function reducer(_state, action) {
  let state = { ..._state };

  switch (action.type) {
    case Types.ACTION_SEEK: {
      const offset = action.offset;

      // Clamp into the loop so the player is never asked for out-of-range time.
      if (state.loop && state.loop.startTime !== null) {
        const loopOffset = state.loop.startTime;
        const loopEnd = loopOffset + state.loop.duration;
        if (offset < loopOffset) {
          state.offset = loopOffset;
          break;
        } else if (offset > loopEnd) {
          state.offset = loopEnd;
          break;
        }
      }

      state.offset = offset;
      break;
    }

    // Reported by the video element. This is the only action that advances
    // position during playback, so time can never advance without the media.
    case Types.ACTION_VIDEO_TIME:
      state.offset = action.offset;
      break;

    case Types.ACTION_PAUSE:
      state.desiredPlaySpeed = 0;
      break;

    case Types.ACTION_PLAY:
      state.desiredPlaySpeed = action.speed;
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

    // UI-only: the spinner reflects real media buffering, it never gates the clock.
    case Types.ACTION_BUFFER_VIDEO:
      state.isBufferingVideo = action.buffering;
      break;

    case Types.ACTION_RESET:
      state.desiredPlaySpeed = 1;
      state.isBufferingVideo = true;
      state.offset = 0;
      break;

    default:
      break;
  }

  // The qcamera's first frame can start after the logs do, so a loop covering
  // the whole route may not be playable from its start.
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

  // Keep the recorded position inside the loop so components that read state
  // while the element is detached still see a valid offset.
  if (state.offset !== null && state.loop?.startTime && !getVideo()) {
    const loopOffset = state.loop.startTime;
    if (state.offset < loopOffset) {
      state.offset = loopOffset;
    } else if (state.offset > loopOffset + state.loop.duration) {
      state.offset = ((state.offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return state;
}

/**
 * Record the position the video reported, in ms from the start of the route.
 * @param {number} offset
 */
export function videoTime(offset) {
  return {
    type: Types.ACTION_VIDEO_TIME,
    offset,
  };
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