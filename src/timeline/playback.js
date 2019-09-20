// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better

const initialState = require('./initialState');

const ACTION_SEEK = 'action_seek';
const ACTION_PAUSE = 'action_pause';
const ACTION_PLAY = 'action_play';
const ACTION_LOOP = 'action_loop';
const ACTION_BUFFER_VIDEO = 'action_buffer_video';
const ACTION_BUFFER_DATA = 'action_buffer_data';
const ACTION_DISABLE_BUFFER = 'action_disable_buffer';

module.exports = {
  pause, play, seek, currentOffset, selectLoop, timestampToOffset,
  reducer, bufferVideo, bufferData, disableBuffer
};

function reducer (state = initialState, action) {
  // console.log(action);
  var loopOffset = null;
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime - state.start;
  }
  switch (action.type) {
    case ACTION_SEEK:
      state.offset = action.offset;
      state.startTime = Date.now();

      if (loopOffset !== null) {
        if (state.offset < loopOffset || state.offset > (loopOffset + state.loop.duration)) {
          // a seek outside of loop should break out of the loop
          state.loop = {startTime: null, duration: null};
          state.loopOffset = null;
        } else {
          if (state.offset > (loopOffset + state.loop.duration)) {
            state.offset = (loopOffset + state.loop.duration) - 1000; // 1 second before end
          }
          // intentionally second in case we're in a sub-1-second loop (madness)
          if (state.offset < loopOffset) {
            state.offset = loopOffset;
          }
        }
      }
      break;
    case ACTION_PAUSE:
      state.offset = currentOffset(state);
      state.playSpeed = 0;
      state.desiredPlaySpeed = 0;
      break;
    case ACTION_PLAY:
      if (action.speed !== state.desiredPlaySpeed) {
        state.offset = currentOffset(state);
        state.desiredPlaySpeed = action.speed;
        state.playSpeed = action.speed;
        state.startTime = Date.now();
      }
      break;
    case ACTION_LOOP:
      state.loop = {
        startTime: action.startTime,
        duration: action.duration
      };
      break;
    case ACTION_BUFFER_VIDEO:
      state.bufferingVideo = action.buffering;
      break;
    case ACTION_BUFFER_DATA:
      state.bufferingData = action.buffering;
      break;
    case ACTION_DISABLE_BUFFER:
      state.shouldBuffer = false;
    default:
      break;
  }

  let offset = state.offset + (Date.now() - state.startTime) * state.playSpeed;
  // normalize over loop
  if (state.loop && state.loop.startTime !== null) {
    loopOffset = state.loop.startTime - state.start;
    // has loop, trap offset within the loop
    if (offset < loopOffset) {
      state.startTime = Date.now();
      state.offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      state.offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
      state.startTime = Date.now();
    }
  }

  state.bufferingVideo = !!state.bufferingVideo;
  state.bufferingData = !!state.bufferingData;
  state.isBuffering = state.shouldBuffer && (state.bufferingVideo || state.bufferingData);

  if (state.isBuffering) {
    if (state.playSpeed > 0) {
      console.log('Entering buffer state, pausing things');
      state.offset = currentOffset(state);
      state.playSpeed = 0;
    }
  } else if (state.playSpeed !== state.desiredPlaySpeed) {
    console.log('Exiting buffer state, resuming things');
    state.offset = currentOffset(state);
    state.startTime = Date.now();
    state.playSpeed = state.desiredPlaySpeed;
  }

  return state;
}

function timestampToOffset (state, timestamp) {
  return timestamp - state.start;
}

// fetch current playback offset
function currentOffset (state) {
  let offset = state.offset + (Date.now() - state.startTime) * state.playSpeed;

  if (state.loop && state.loop.startTime) {
    // respect the loop
    let loopOffset = state.loop.startTime - state.start;
    if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return offset;
}

// seek to a specific offset
function seek (offset) {
  return {
    type: ACTION_SEEK,
    offset: offset
  };
}

// pause the playback
function pause () {
  return {
    type: ACTION_PAUSE
  };
}

// resume / change play speed
function play (speed = 1) {
  return {
    type: ACTION_PLAY,
    speed
  };
}

function selectLoop (startTime, duration) {
  return {
    type: ACTION_LOOP,
    startTime, duration
  };
}

// update video buffering state
function bufferVideo (buffering = true) {
  return {
    type: ACTION_BUFFER_VIDEO,
    buffering
  };
}

// update data buffering state
function bufferData (buffering = true) {
  return {
    type: ACTION_BUFFER_DATA,
    buffering
  };
}

function disableBuffer () {
  return {
    type: ACTION_DISABLE_BUFFER
  };
}
