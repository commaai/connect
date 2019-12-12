import Event from 'geval/event';
import CreateStore from 'weakmap-shim/create-store';
import { timeout } from 'thyming';
import Collector from 'collect-methods';
import { partial } from 'ap';

import { annotations as Annotations, drives as Drives } from '@commaai/comma-api'; // eslint-disable-line

import { currentOffset } from './playback';
import Segments from './segments';
import * as Cache from './cache';
import store from './store';
import * as Demo from '../demo';
import { commands, initAuthPromise } from './commands';

const demoSegments = require('../demo/segments.json');

const BroadcastEvent = Event();
const DataLogEvent = Event();
const SegmentTimerStore = CreateStore();

let segmentsRequest = null;
let annotationsRequest = null;

export function getState() {
  return store.getState();
}

function scheduleSegmentUpdate(state) {
  let timeUntilNext = 30000;
  const offset = currentOffset(state);

  if (SegmentTimerStore(state).stopTimer) {
    SegmentTimerStore(state).stopTimer();
    SegmentTimerStore(state).stopTimer = null;
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
    timeUntilNext = Math.max(200, timeUntilNext);
    console.log('Waiting', timeUntilNext, 'for something to change...');
    SegmentTimerStore(state).stopTimer = timeout(() => {
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
  if (segmentsRequest || annotationsRequest) {
    return;
  }
  console.log('We need to update the segment metadata...');
  const { dongleId } = state;
  const { start } = state;
  const { end } = state;

  let segmentData = null;
  let annotationsData = null;
  if (Demo.isDemo()) {
    segmentsRequest = Promise.resolve(demoSegments);
    annotationsRequest = Promise.resolve([]);
  } else {
    segmentsRequest = Drives.getSegmentMetadata(start, end, dongleId);
    annotationsRequest = Annotations.listAnnotations(start, end, dongleId);
  }
  store.dispatch(Segments.fetchSegmentMetadata(start, end));

  try {
    segmentData = await segmentsRequest;
    annotationsData = await annotationsRequest;
  } catch (e) {
    console.error('Failure fetching segment metadata', e.stack || e);
    // /@TODO retry this call!
    return;
  } finally {
    segmentsRequest = null;
    annotationsRequest = null;
  }
  if (state.start !== start || state.end !== end || state.dongleId !== dongleId) {
    checkSegmentMetadata(getState());
    return;
  }

  segmentData = Segments.parseSegmentMetadata(state, segmentData, annotationsData);
  // broken
  store.dispatch(Segments.insertSegmentMetadata(segmentData));
  // ensureSegmentData(getState());
}

let ensureSegmentDataTimer = null;
async function ensureSegmentData(state) {
  if (ensureSegmentDataTimer) {
    ensureSegmentDataTimer();
    ensureSegmentDataTimer = null;
  }

  let entry = null;
  if (Date.now() - state.startTime < 1000) {
    ensureSegmentDataTimer = timeout(() => {
      ensureSegmentDataTimer = null;
      return ensureSegmentData(getState());
    }, 1100 - (Date.now() - state.startTime));
    return;
  }
  if (state.route) {
    entry = Cache.getEntry(state.route, state.segment, DataLogEvent.broadcast);
    if (entry) {
      entry.start();
    }
    if (state.segment !== 0) {
      entry = Cache.getEntry(state.route, 0, DataLogEvent.broadcast);
      if (entry) {
        entry.start();
      }
    }
  }
  const { nextSegment } = state;
  if (nextSegment) {
    entry = Cache.getEntry(nextSegment.route, nextSegment.segment, DataLogEvent.broadcast);
    if (entry) {
      entry.start();
    }
  }
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
    ensureSegmentData(state);

    BroadcastEvent.broadcast({
      command: 'state',
      data: state
    });
  });
}

export async function handleMessage(port, msg) {
  if (msg.data.command) {
    if (!commands[msg.data.command]) {
      console.error('Invalid command!', msg.data);
      return;
    }
    let result = commands[msg.data.command](port, msg.data.data, msg.ports);
    if (result && msg.data.requestId) {
      result = await result;
      if (result) {
        port.postMessage({
          requestId: msg.data.requestId,
          command: 'return-value',
          data: result
        });
      }
    }
  }
}
