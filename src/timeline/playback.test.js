const Playback = require('./playback');

var makeDefaultStruct = function() {
  return {
    start: Date.now(),
    playSpeed: 0, // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
    offset: 0, // in miliseconds from the start
    startTime: Date.now() // millisecond timestamp in which play began
  };
}

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
  var state = makeDefaultStruct();

  // should do nothing
  Playback.reducer(state, Playback.pause());
  expect(state.playSpeed).toEqual(0);

  // start playing, should set start time and such
  var playTime = newNow();
  Playback.reducer(state, Playback.play());
  // this is a (usually 1ms) race condition
  expect(state.startTime).toEqual(playTime);
  expect(state.playSpeed).toEqual(1);

  await delay(100 + Math.random() * 200);
  // should update offset
  var ellapsed = newNow() - playTime;
  Playback.reducer(state, Playback.pause());

  expect(state.offset).toEqual(ellapsed);

  // start playing, should set start time and such
  playTime = newNow();
  Playback.reducer(state, Playback.play(0.5));
  // this is a (usually 1ms) race condition
  expect(state.startTime).toEqual(playTime);
  expect(state.playSpeed).toEqual(0.5);

  await delay(100 + Math.random() * 200);
  // should update offset, playback speed 1/2
  ellapsed = ellapsed + (newNow() - playTime) / 2;
  expect(Playback.currentOffset(state)).toEqual(ellapsed);
  Playback.reducer(state, Playback.pause());

  expect(state.offset).toEqual(ellapsed);

  // seek!
  newNow();
  Playback.reducer(state, Playback.seek(123));
  expect(state.offset).toEqual(123);
  expect(state.startTime).toEqual(Date.now());
  expect(Playback.currentOffset(state)).toEqual(123);
});

test('loop should clear when seeked after loop end time', function() {
  newNow();
  var state = makeDefaultStruct();

  // set up loop
  Playback.reducer(state, Playback.play());
  Playback.reducer(state, Playback.selectLoop(1000, 1000));
  expect(state.loop.startTime).toEqual(1000);

  // seek past loop end boundary a
  Playback.reducer(state, Playback.seek(3000));
  expect(state.loop.startTime).toEqual(null);
});

test('loop should clear when seeked before loop start time', function() {
  newNow();
  var state = makeDefaultStruct();

  // set up loop
  Playback.reducer(state, Playback.play());
  Playback.reducer(state, Playback.selectLoop(1000, 1000));
  expect(state.loop.startTime).toEqual(1000);

  // seek past loop end boundary a
  Playback.reducer(state, Playback.seek(0));
  expect(state.loop.startTime).toEqual(null);
});

async function delay (ms) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}
