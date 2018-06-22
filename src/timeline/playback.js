// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better

const initialState = require('./initialState');

const ACTION_SEEK = 'seek';
const ACTION_PAUSE = 'pause';
const ACTION_PLAY = 'play';

module.exports = {
  pause, play, seek, currentOffset,
  reducer
};

function reducer (state = initialState, action) {
  // console.log(action);
  switch (action.type) {
    case ACTION_SEEK:
      state.offset = action.offset;
      state.startTime = Date.now();
      break;
    case ACTION_PAUSE:
      state.offset = currentOffset(state);
      state.playSpeed = 0;
      break;
    case ACTION_PLAY:
      if (action.speed !== state.playSpeed) {
        state.offset = currentOffset(state);
        state.playSpeed = action.speed;
        state.startTime = Date.now();
      }
      break;
    default:
      break;
  }

  let offset = state.offset + (Date.now() - state.startTime) * state.playSpeed;
  // normalize over loop
  if (state.loop && state.loop.startTime) {
    let loopOffset = state.loop.startTime - state.start;
    // has loop, trap offset within the loop
    if (offset < loopOffset) {
      state.startTime = Date.now();
      state.offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      state.offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
      state.startTime = Date.now();
    }
  }

  return state;
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
