import Event from 'geval/event';
import * as Sentry from "@sentry/react";

import { drives as Drives } from '@commaai/comma-api'; // eslint-disable-line

import { currentOffset } from './playback';
import Segments from './segments';
import store from './store';
import * as Demo from '../demo';
import { initAuthPromise } from './commands';

const demoSegments = require('../demo/segments.json');

const BroadcastEvent = Event();

let segmentsTimer = null;
let segmentsRequest = null;

export function getState() {
  return store.getState();
}

function scheduleSegmentUpdate(state) {
  let timeUntilNext = 30000;
  const offset = currentOffset(state);

  if (segmentsTimer) {
    clearTimeout(segmentsTimer);
    segmentsTimer = null;
  }
  if (state.nextSegment) {
    timeUntilNext = state.nextSegment.startOffset - offset;
  }
  if (timeUntilNext < 0) {
    // debugger;
  }
  if (state.currentSegment) {
    const time = (state.currentSegment.routeOffset + state.currentSegment.duration) - offset;
    timeUntilNext = Math.min(time, timeUntilNext);
  }
  if (timeUntilNext < 0) {
    // debugger;
  }
  if (state.loop && state.loop.startTime) {
    const curTime = state.start + offset;
    // curTime will be between start and end because we used currentOffset to get it
    // currentOffset takes into account loops using modulo over duration
    const timeUntilLoop = 1 + state.loop.startTime + state.loop.duration - curTime;
    const loopStartOffset = state.loop.startTime - state.start;
    const loopStartSegment = Segments.getCurrentSegment(state, loopStartOffset);
    if (!state.currentSegment
      || !loopStartSegment
      || loopStartSegment.startOffset !== state.currentSegment.startOffset) {
      timeUntilNext = Math.min(timeUntilLoop, timeUntilNext);
    }
  }
  if (timeUntilNext < 0) {
    // debugger;
  }

  if (timeUntilNext > 0) {
    timeUntilNext = Math.min(30000, Math.max(200, timeUntilNext));
    console.log('Waiting', timeUntilNext, 'for something to change...');
    segmentsTimer = setTimeout(() => {
      // empty action to churn the butter
      store.dispatch(Segments.updateSegments());
    }, timeUntilNext);
  } else {
    console.log('There is not task i think its worth waiting for...', timeUntilNext);
    // debugger;
  }
}

async function checkSegmentMetadata(state) {
  if (!state.dongleId) {
    return;
  }
  if (Segments.hasSegmentMetadata(state)) {
    // already has metadata, don't bother
    return;
  }
  await Demo.init();
  if (segmentsRequest) {
    return;
  }
  console.log('We need to update the segment metadata...');
  const { dongleId, start, end } = state;

  let segmentData = null;
  if (Demo.isDemo()) {
    segmentsRequest = Promise.resolve(demoSegments);
  } else {
    segmentsRequest = Drives.getSegmentMetadata(start, end, dongleId);
  }
  store.dispatch(Segments.fetchSegmentMetadata(start, end));

  try {
    segmentData = await segmentsRequest;
  } catch (err) {
    console.error('Failure fetching segment metadata', err);
    Sentry.captureException(err, { fingerprint: 'timeline_fetch_segments' });
    // /@TODO retry this call!
    return;
  } finally {
    segmentsRequest = null;
  }
  if (state.start !== start || state.end !== end || state.dongleId !== dongleId) {
    checkSegmentMetadata(getState());
    return;
  }

  segmentData = Segments.parseSegmentMetadata(state, segmentData);
  // broken
  store.dispatch(Segments.insertSegmentMetadata(segmentData));
}

export function init() {
  // set up initial schedules
  initAuthPromise.then(() => {
    scheduleSegmentUpdate(getState());
    checkSegmentMetadata(getState());
  });

  store.subscribe(() => {
    const state = getState();
    checkSegmentMetadata(state);
    scheduleSegmentUpdate(state);

    BroadcastEvent.broadcast({
      command: 'state',
      data: state
    });
  });
}
