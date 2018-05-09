// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better

module.exports = {
  pause, play, seek, currentOffset
};

// fetch current playback offset
function currentOffset (state) {
  return state.offset() + (Date.now() - state.startTime()) * state.playSpeed();
}

// seek to a specific offset
function seek (state, offset) {
  state.offset.set(offset);
  state.startTime.set(Date.now());
}

// pause the playback
function pause (state) {
  flattenOffset(state);
  state.playSpeed.set(0);
}

// resume / change play speed
function play (state, speed = 1) {
  var currentPlayState = state.playSpeed();
  if (speed === currentPlayState) {
    // do nothing, we're already playing at that speed
    return;
  }
  var currentOffset = state.offset();
  var now = Date.now();
  var playTime = now - state.startTime();
  flattenOffset(state);
  state.playSpeed.set(speed);
  state.startTime.set(now);
}

// internal helper to calculate offset changes when playSpeed is going to change
function flattenOffset (state) {
  var prevPlaySpeed = state.playSpeed();
  if (prevPlaySpeed !== 0) {
    state.offset.set(state.offset() + (Date.now() - state.startTime()) * prevPlaySpeed);
  }
}
