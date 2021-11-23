// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import * as Types from '../actions/types';
import store from '../store';

// fetch current playback offset
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

  let playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
  let offset = state.offset + ((Date.now() - state.startTime) * playSpeed);

  if (state.loop && state.loop.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime - state.filter.start;
    if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return offset;
}

export function reducer(_state, action) {
  let state = { ..._state };
  let loopOffset = null;
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime - state.filter.start;
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
      state = {
        ...state,
        loop: {
          startTime: action.startTime,
          duration: action.duration,
        }
      };
      if (action.duration > 0 && action.startTime > 0) {
        state.filter = {
          start: Math.min(action.startTime, state.filter.start),
          end: Math.max(action.startTime + action.duration, state.filter.end),
        }
      }
      break;
    case Types.ACTION_BUFFER_VIDEO:
      state = {
        ...state,
        isBufferingVideo: action.buffering,
        offset: currentOffset(state),
        startTime: Date.now(),
      }
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: false,
        offset: 0,
        startTime: Date.now(),
      };
      break;
    default:
      break;
  }

  let playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
  const offset = state.offset + (Date.now() - state.startTime) * playSpeed;
  // normalize over loop
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime - state.filter.start;
    // has loop, trap offset within the loop
    if (offset < loopOffset) {
      state.startTime = Date.now();
      state.offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      state.offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
      state.startTime = Date.now();
    }
  }

  state.isBufferingVideo = Boolean(state.isBufferingVideo);

  return state;
}

// seek to a specific offset
export function seek(offset) {
  return {
    type: Types.ACTION_SEEK,
    offset
  };
}

// pause the playback
export function pause() {
  return {
    type: Types.ACTION_PAUSE
  };
}

// resume / change play speed
export function play(speed = 1) {
  return {
    type: Types.ACTION_PLAY,
    speed
  };
}

export function selectLoop(startTime, duration) {
  return {
    type: Types.ACTION_LOOP,
    startTime,
    duration
  };
}

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering
  };
}

export function resetPlayback() {
  return {
    type: Types.ACTION_RESET,
  };
}
