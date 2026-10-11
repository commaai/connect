import { asyncSleep } from '../utils';
import { currentOffset } from '.';
import {
  bufferVideo,
  pause,
  play,
  reducer,
  seek,
  selectLoop,
  videoProgress,
} from './playback';

const makeDefaultStruct = function makeDefaultStruct() {
  return {
    desiredPlaySpeed: 1,
    offset: 0,
    startTime: Date.now(),
    isBuffering: true,
  };
};

// make Date.now super stable for tests
let mostRecentNow = Date.now();
const oldNow = Date.now;

Date.now = function now() {
  return mostRecentNow;
};

function newNow() {
  mostRecentNow = oldNow();
  return mostRecentNow;
}

describe('playback', () => {
  it('has playback controls', async () => {
    newNow();

    let state = makeDefaultStruct();

    state = reducer(state, pause());
    expect(state.desiredPlaySpeed).toEqual(0);

    const playTime = newNow();

    state = reducer(state, play());

    expect(state.startTime).toEqual(playTime);
    expect(state.desiredPlaySpeed).toEqual(1);

    await asyncSleep(100 + Math.random() * 200);

    const ellapsed = newNow() - playTime;

    state = reducer(state, pause());

    expect(state.offset).toEqual(ellapsed);

    const secondPlayTime = newNow();

    state = reducer(state, play(0.5));

    expect(state.startTime).toEqual(secondPlayTime);
    expect(state.desiredPlaySpeed).toEqual(0.5);

    await asyncSleep(100 + Math.random() * 200);

    const secondElapsed = (newNow() - secondPlayTime) / 2;
    const expectedOffset = ellapsed + secondElapsed;

    expect(currentOffset(state)).toEqual(expectedOffset);

    state = reducer(state, pause());

    expect(state.offset).toEqual(expectedOffset);

    newNow();

    state = reducer(state, seek(123));

    expect(state.offset).toEqual(123);
    expect(state.startTime).toEqual(Date.now());
    expect(currentOffset(state)).toEqual(123);
  });

  it('uses video progress as the playback position', () => {
    let state = makeDefaultStruct();

    state = reducer(state, videoProgress(12345));

    expect(state.offset).toEqual(12345);
    expect(state.isBufferingVideo).toEqual(false);
  });

  it('updates video progress when the video moves again', () => {
    let state = makeDefaultStruct();

    state = reducer(state, videoProgress(12345));
    state = reducer(state, videoProgress(18765));

    expect(state.offset).toEqual(18765);
    expect(state.isBufferingVideo).toEqual(false);
  });

  it('should clamp loop when seeked after loop end time', () => {
    newNow();

    let state = makeDefaultStruct();

    state = reducer(state, play());

    state = reducer(
      state,
      selectLoop(
        1000,
        2000,
      ),
    );

    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(3000));

    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(2000);
  });

  it('should clamp loop when seeked before loop start time', () => {
    newNow();

    let state = makeDefaultStruct();

    state = reducer(state, play());

    state = reducer(
      state,
      selectLoop(
        1000,
        2000,
      ),
    );

    expect(state.loop.startTime).toEqual(1000);

    state = reducer(state, seek(0));

    expect(state.loop.startTime).toEqual(1000);
    expect(state.offset).toEqual(1000);
  });

  it('should buffer video and data', async () => {
    newNow();

    let state = makeDefaultStruct();

    state = reducer(state, play());

    expect(state.desiredPlaySpeed).toEqual(1);

    state = reducer(state, bufferVideo(true));

    expect(state.desiredPlaySpeed).toEqual(1);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(0.5));

    expect(state.desiredPlaySpeed).toEqual(0.5);
    expect(state.isBufferingVideo).toEqual(true);

    state = reducer(state, play(2));
    state = reducer(state, bufferVideo(false));

    expect(state.desiredPlaySpeed).toEqual(2);
    expect(state.isBufferingVideo).toEqual(false);
  });
});

it('preserves video position while buffering', () => {
  let state = makeDefaultStruct();

  state = reducer(state, videoProgress(12345));
  state = reducer(state, bufferVideo(true));

  expect(state.offset).toEqual(12345);
  expect(state.isBufferingVideo).toEqual(true);
});