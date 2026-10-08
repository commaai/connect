// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import { currentOffset } from '.';

export function reducer(_state, action) {
  let state = { ..._state };
  let loopOffset = null;
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime;
  }
  switch (action.type) {
    case Types.ACTION_SEEK:
      state = {
        ...state,
        offset: action.offset,
        startTime: Date.now(),
      };

      if (loopOffset !== null) {
        if (state.offset < loopOffset) {
          state.offset = loopOffset;
        } else if (state.offset > (loopOffset + state.loop.duration)) {
          state.offset = loopOffset + state.loop.duration;
        }
      }

      // intent for the transport controller: applied to the video element once,
      // identified by nonce so rapid seeks never replay a stale one
      state.seekRequest = { offset: state.offset, nonce: action.nonce };
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: currentOffset(state),
        startTime: Date.now(),
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state = {
          ...state,
          offset: currentOffset(state),
          desiredPlaySpeed: action.speed,
          startTime: Date.now(),
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
        startTime: Date.now(),
      };
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
        startTime: Date.now(),
        seekRequest: null,
      };
      break;
    case Types.ACTION_VIDEO_ERROR:
      state = {
        ...state,
        videoError: action.error,
      };
      break;
    case Types.ACTION_VIDEO_SEEKING:
      state = {
        ...state,
        isSeekingVideo: action.seeking,
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

  // the transport controller traps the loop on the video element itself,
  // and currentOffset() still traps for the no-video fallback below
  state.isBufferingVideo = Boolean(state.isBufferingVideo);

  return state;
}

// seek to a specific offset
// the nonce lets the transport controller apply each seek exactly once
let seekNonce = 0;
export function seek(offset) {
  seekNonce += 1;
  return {
    type: Types.ACTION_SEEK,
    offset,
    nonce: seekNonce,
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

// report a fatal video error, or null to clear it
export function setVideoError(error) {
  return {
    type: Types.ACTION_VIDEO_ERROR,
    error,
  };
}

// report whether the video is actively seeking (drives seek feedback UI)
export function setVideoSeeking(seeking) {
  return {
    type: Types.ACTION_VIDEO_SEEKING,
    seeking,
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
