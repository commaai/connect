import Event from 'geval/event';
import CreateStore from 'weakmap-shim/create-store';
import debounce from 'debounce';
import { createStore } from 'redux';
import reduceReducers from 'reduce-reducers';
import { timeout } from 'thyming';
import storage from 'localforage';
import * as API from '../api';

import Playback from './playback';
import Segments from './segments';
import * as Cache from './cache';

const BroadcastEvent = Event();
const DataLogEvent = Event();
const PortState = CreateStore();
const SegmentTimerStore = CreateStore();

const store = createStore(reduceReducers(Playback.reducer, Segments.reducer));

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
});

const commands = {
  close,
  seek
};

export function handleMessage (port, msg) {
  console.log('Got this message', msg);

  if (msg.data.command) {
    if (!commands[msg.data.command]) {
      console.error('Invalid command!', msg.data);
      return;
    }
    commands[msg.data.command](port, msg.data.data);
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

  var dataUnlisten = DataLogEvent.listen(sendData);

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
  } else {
    broadcastPort = port;
  }
  var unlisten = BroadcastEvent.listen(broadcastPort.postMessage.bind(broadcastPort));

  PortState(port).broadcastPort = receiverPort;
  PortState(port).closePort = closePort;

  return receiverPort;

  function closePort () {
    unlisten();
    dataUnlisten();
    if (broadcastChannel) {
      broadcastChannel.port1.close();
    }
  }

  function sendData (msg) {
    var buffer = null;
    if (msg.data.length === 1) {
      // force copy for older versions of node/shim
      buffer = new Buffer(msg.data);
    } else {
      buffer = Buffer.concat(msg.data);
    }
    console.log('Data event', msg.data.length);
    port.postMessage({
      command: 'data',
      route: msg.route,
      segment: msg.segment,
      data: buffer.buffer
    }, [buffer.buffer]);
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

function getDefaultStartDate () {
  var d = new Date();
  d.setHours(d.getHours(), 0, 0, 0);

  return new Date(d.getTime() - 1000 * 60 * 60 * 24);
}

function getDefaultEndDate () {
  var d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return d;
}

function scheduleSegmentUpdate (state) {
  if (state.nextSegment) {
    let timeUntilNext = state.nextSegment.startOffset - Playback.currentOffset(state);
    if (SegmentTimerStore(state).stopTimer) {
      SegmentTimerStore(state).stopTimer();
    }
    SegmentTimerStore(state).stopTimer = timeout(function () {
      // empty action to churn the butter
      store.dispatch(Segments.updateSegments());
    }, timeUntilNext);
  }
}

async function checkSegmentMetadata (state) {
  if (Segments.hasSegmentMetadata(state)) {
    // already has metadata, don't bother
    return true;
  }
  console.log('We need to update the segment metadata...');
  var dongleId = state.dongleId;
  var start = state.start;
  var end = state.end;

  var segmentData = API.getSegmentMetadata(start, end, dongleId);
  store.dispatch(Segments.fetchSegmentMetadata(start, end));

  try {
    segmentData = await segmentData;
  } catch (e) {
    console.error('Failure fetching segment metadata', e.stack || e);
    ///@TODO retry this call!
    return;
  }
  if (state.start !== start || state.end !== end || state.dongleId !== dongleId) {
    return;
  }

  segmentData = Segments.parseSegmentMetadata(state, segmentData);
  store.dispatch(Segments.insertSegmentMetadata(segmentData));

  // console.log(segmentData);
  /*
  [
  {
    "git_remote": "git@github.com:commaai/openpilot-private.git",
    "version": "0.4.5-release",
    "start_time_utc": 1526238478367.276,
    "proc_dcamera": -1,
    "hpgps": true,
    "create_time": 1526240213,
    "proc_camera": 3,
    "end_lng": -122.47,
    "start_lng": -122.471,
    "passive": null,
    "canonical_name": "99c94dc769b5d96e|2018-05-13--12-07-39--0",
    "proc_log": 3,
    "git_branch": "master",
    "end_lat": 37.7612,
    "log_url": "https://commadata2.blob.core.windows.net/commadata2/99c94dc769b5d96e/2018-05-13--12-07-39/0/rlog.bz2?sr=b&sp=r&sig=Gg0E2wmXj6tC5wdvo1mF668kIQE24K3S1Uxhfq130tg%3D&sv=2016-05-31&se=2018-05-14T19%3A48%3A39Z",
    "canonical_route_name": "99c94dc769b5d96e|2018-05-13--12-07-39",
    "devicetype": 3,
    "end_time_utc": 1526238538598,
    "start_lat": 37.7616,
    "git_dirty": true,
    "url": null,
    "length": 0.023396,
    "dongle_id": "99c94dc769b5d96e",
    "can": true,
    "git_commit": "adcda9ee0da05dea8e033b7f012eb0243a4d00d4"
  },
  {
    "git_remote": "git@github.com:commaai/openpilot-private.git",
    "version": "0.4.5-release",
    "start_time_utc": 1526238538363.561,
    "proc_dcamera": -1,
    "hpgps": true,
    "create_time": 1526240242,
    "proc_camera": 3,
    "end_lng": -122.47,
    "start_lng": -122.47,
    "passive": null,
    "canonical_name": "99c94dc769b5d96e|2018-05-13--12-07-39--1",
    "proc_log": 3,
    "git_branch": "master",
    "end_lat": 37.761,
    "log_url": "https://commadata2.blob.core.windows.net/commadata2/99c94dc769b5d96e/2018-05-13--12-07-39/1/rlog.bz2?sr=b&sp=r&sig=Xvf2ItGp5YAGmncm8/OSf/F5XXWiK0gl2i58rI7Lf%2BU%3D&sv=2016-05-31&se=2018-05-14T19%3A48%3A39Z",
    "canonical_route_name": "99c94dc769b5d96e|2018-05-13--12-07-39",
    "devicetype": 3,
    "end_time_utc": 1526238598598,
    "start_lat": 37.761,
    "git_dirty": true,
    "url": null,
    "length": 0.014266,
    "dongle_id": "99c94dc769b5d96e",
    "can": true,
    "git_commit": "adcda9ee0da05dea8e033b7f012eb0243a4d00d4"
  },
  {
  */
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
  }
  if (state.nextSegment) {
    Cache.getEntry(state.nextSegment.route, state.nextSegment.segment, DataLogEvent.broadcast);
  }
  if (entry) {
    entry.start();
  }
}
