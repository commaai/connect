const Value = require('observ');
const Struct = require('observ-struct');
const Playback = require('./playback');

var defaultStruct = {
  playSpeed: Value(0), // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
  offset: Value(0), // in miliseconds from the start
  startTime: Value(Date.now()) // millisecond timestamp in which play began
};

// make Date.now super stable for tests
var mostRecentNow = Date.now();
Date._now = Date.now;
Date.now = function () {
  return mostRecentNow;
};
function newNow () {
  mostRecentNow = Date._now();
  return mostRecentNow;
}

test('playback controls', async function () {
  newNow();
  var state = Struct(defaultStruct);

  // should do nothing
  Playback.pause(state);
  expect(state.playSpeed()).toEqual(0);

  // start playing, should set start time and such
  var playTime = newNow();
  Playback.play(state);
  // this is a (usually 1ms) race condition
  expect(state.startTime()).toEqual(playTime);
  expect(state.playSpeed()).toEqual(1);

  await delay(100 + Math.random() * 200);
  // should update offset
  var ellapsed = newNow() - playTime;
  Playback.pause(state);

  expect(state.offset()).toEqual(ellapsed);

  // start playing, should set start time and such
  playTime = newNow();
  Playback.play(state, 0.5);
  // this is a (usually 1ms) race condition
  expect(state.startTime()).toEqual(playTime);
  expect(state.playSpeed()).toEqual(0.5);

  await delay(100 + Math.random() * 200);
  // should update offset, playback speed 1/2
  ellapsed = ellapsed + (newNow() - playTime) / 2;
  expect(Playback.currentOffset(state)).toEqual(ellapsed);
  Playback.pause(state);

  expect(state.offset()).toEqual(ellapsed);

  // seek!
  newNow();
  Playback.seek(state, 123);
  expect(state.offset()).toEqual(123);
  expect(state.startTime()).toEqual(Date.now());
  expect(Playback.currentOffset(state)).toEqual(123);
});

async function delay (ms) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}
