import Event from 'geval/event';
import CreateStore from 'weakmap-shim/create-store';
import debounce from 'debounce';
import { timeout } from 'thyming';
import storage from 'localforage';
import Collector from 'collect-methods';

import * as API from '../api';

import init from './startup';
import {
  selectDevice as selectDeviceAction,
  selectTimeRange as selectTimeRangeAction,
  updateDevice as updateDeviceAction,
} from './actions';
import Playback from './playback';
import Segments from './segments';
import * as Cache from './cache';
import store from './store';

const BroadcastEvent = Event();
const DataLogEvent = Event();
const PortState = CreateStore();
const SegmentTimerStore = CreateStore();

// fire off init method / construct init promises
let hasGottenSegmentData = null;
let hasGottenSegmentDataPromise = new Promise(function (resolve, reject) {
  hasGottenSegmentData = function () {
    hasGottenSegmentData = noop;
    resolve();
  };
});

var segmentsRequest = null;
var annotationsRequest = null;

// set up initial schedules
scheduleSegmentUpdate(getState());
checkSegmentMetadata(getState());

// segments
// start offset
// length
// name
// all other attributes stored in cache entries

// setInterval(function () {
//   let speed = ~~(Math.random() * 3) / 2;
//   console.log('Setting play speed...', speed);
//   store.dispatch(Playback.play(speed));
// }, 5000);

store.subscribe(function () {
  const state = getState();
  checkSegmentMetadata(state);
  scheduleSegmentUpdate(state);
  ensureSegmentData(state);

  BroadcastEvent.broadcast({
    command: 'state',
    data: state
  });
  if (Segments.hasSegmentMetadata(state)) {
    hasGottenSegmentData();
  }
});

const commands = {
  close,
  play,
  pause,
  seek,
  hello,
  resolve,
  selectDevice,
  selectTimeRange,
  selectLoop,
  updateDevice,
};

export async function handleMessage (port, msg) {
  console.log('Got this message', msg);

  if (msg.data.command) {
    if (!commands[msg.data.command]) {
      console.error('Invalid command!', msg.data);
      return;
    }
    let result = commands[msg.data.command](port, msg.data.data);
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

export function getState () {
  return store.getState();
}

export function createBroadcastPort (port) {
  if (PortState(port).broadcastPort) {
    return PortState(port).broadcastPort;
  }
  const state = getState();
  var broadcastChannel = null;
  var broadcastPort = null;
  var receiverPort = null;
  var unlisten = Collector();

  unlisten(DataLogEvent.listen(sendData));
  unlisten(Cache.onExpire(handleExpire));

  if (state.route) {
    let entry = Cache.getEntry(state.route, state.segment);
    if (entry) {
      entry.getLog((data) => sendData({
        route: state.route,
        segment: state.segment,
        data: data
      }));
    }
  }

  if (typeof MessageChannel === 'function') {
    broadcastChannel = new MessageChannel();
    broadcastPort = broadcastChannel.port1;
    receiverPort = broadcastChannel.port2;
    unlisten(() => broadcastChannel.port1.close());
  } else {
    broadcastPort = port;
  }
  unlisten(BroadcastEvent.listen(broadcastPort.postMessage.bind(broadcastPort)));

  PortState(port).broadcastPort = receiverPort;
  PortState(port).closePort = unlisten;

  return receiverPort;

  function sendData (msg) {
    var buffer = null;
    if (msg.data.length === 1) {
      // force copy for older versions of node/shim
      buffer = Buffer.from(msg.data);
    } else {
      buffer = Buffer.concat(msg.data);
    }
    port.postMessage({
      command: 'data',
      route: msg.route,
      segment: msg.segment,
      data: buffer.buffer
    }, [buffer.buffer]);
  }

  function handleExpire (data) {
    port.postMessage({
      ...data,
      command: 'expire'
    });
  }
}

function close (port) {
  if (PortState(port).unlisten) {
    PortState(port).unlisten();
  }
  if (PortState(port).broadcastChannel) {
    PortState(port).broadcastChannel.port1.close();
  }
  port.close();
}

function seek (port, offset) {
  store.dispatch(Playback.seek(offset));
}

function pause (port) {
  store.dispatch(Playback.pause());
}

function play (port, speed) {
  store.dispatch(Playback.play(speed));
}

async function hello (port, data) {
  console.log(data);
  store.dispatch(selectDeviceAction(data.dongleId));
  await Promise.all([
    init(),
    hasGottenSegmentDataPromise
  ]);
  return 'hello';
}

function resolve (port, data) {
  const { annotation, event, route } = data;

  store.dispatch(Segments.resolveAnnotation(annotation, event, route));
}

function selectDevice (port, dongleId) {
  store.dispatch(selectDeviceAction(dongleId));
}

function updateDevice (port, device) {
  store.dispatch(updateDeviceAction(device));
}

function selectTimeRange (port, data) {
  const { start, end } = data;
  store.dispatch(selectTimeRangeAction(start, end));
}

function selectLoop (port, data) {
  const { startTime, duration } = data;
  store.dispatch(Playback.selectLoop(startTime, duration));
}

function scheduleSegmentUpdate (state) {
  let timeUntilNext = 0;
  let offset = Playback.currentOffset(state);

  if (SegmentTimerStore(state).stopTimer) {
    SegmentTimerStore(state).stopTimer();
    SegmentTimerStore(state).stopTimer = null;
  }
  if (state.nextSegment) {
    timeUntilNext = state.nextSegment.startOffset - offset;
  }
  if (state.currentSegment) {
    let time = (state.currentSegment.startOffset + state.currentSegment.duration) - offset;
    timeUntilNext = Math.min(time, timeUntilNext);
  }
  if (state.loop && state.loop.startTime) {
    let curTime = state.start + offset;
    // curTime will be between start and end because we used currentOffset to get it
    // currentOffset takes into account loops using modulo over duration
    let timeUntilLoop = state.loop.startTime + state.loop.duration - curTime;
    let loopStartOffset = state.loop.startTime - state.start;
    let loopStartSegment = Segments.getCurrentSegment(state, loopStartOffset);
    if (!state.currentSegment || !loopStartSegment || loopStartSegment.startOffset !== state.currentSegment.startOffset) {
      timeUntilNext = Math.min(timeUntilLoop, timeUntilNext);
    }
  }

  if (timeUntilNext > 0) {
    console.log('Waiting', timeUntilNext, 'for something to change...');
    SegmentTimerStore(state).stopTimer = timeout(function () {
      // empty action to churn the butter
      store.dispatch(Segments.updateSegments());
    }, timeUntilNext);
  } else {
    console.log('There is not task i think its worth waiting for...');
  }
}

async function checkSegmentMetadata (state) {
  if (!state.dongleId) {
    return;
  }
  if (Segments.hasSegmentMetadata(state)) {
    // already has metadata, don't bother
    return true;
  }
  if (segmentsRequest || annotationsRequest) {
    return;
  }
  console.log('We need to update the segment metadata...');
  var dongleId = state.dongleId;
  var start = state.start;
  var end = state.end;

  var segmentData = null;
  var annotationsData = null;
  segmentsRequest = API.getSegmentMetadata(start, end, dongleId);
  annotationsRequest = API.listAnnotations(start, end, dongleId);
  store.dispatch(Segments.fetchSegmentMetadata(start, end));

  try {
    segmentData = await segmentsRequest;
    annotationsData = await annotationsRequest;
    console.log(segmentData, annotationsData);
  } catch (e) {
    console.error('Failure fetching segment metadata', e.stack || e);
    ///@TODO retry this call!
    return;
  } finally {
    segmentsRequest = null;
    annotationsRequest = null;
  }
  if (state.start !== start || state.end !== end || state.dongleId !== dongleId) {
    return checkSegmentMetadata(getState());
  }

  segmentData = Segments.parseSegmentMetadata(state, segmentData, annotationsData);
  // broken
  store.dispatch(Segments.insertSegmentMetadata(segmentData));
  // ensureSegmentData(getState());
}

var ensureSegmentDataTimer = null;
async function ensureSegmentData (state) {
  if (ensureSegmentDataTimer) {
    ensureSegmentDataTimer();
    ensureSegmentDataTimer = null;
  }

  var entry = null;
  if (Date.now() - state.startTime < 1000) {
    ensureSegmentDataTimer = timeout(function () {
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
      entry = Cache.getEntry(state.route, state.segment, DataLogEvent.broadcast);
      if (entry) {
        entry.start();
      }
    }
  }
  if (state.nextSegment) {
    entry = Cache.getEntry(state.nextSegment.route, state.nextSegment.segment, DataLogEvent.broadcast);
    if (entry) {
      entry.start();
    }
  }
}

function noop () {
}
