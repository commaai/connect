import CreateStore from 'weakmap-shim/create-store';
import Auth from '@commaai/my-comma-auth';
import { request as Request } from '@commaai/comma-api'; // eslint-disable-line

import {
  selectDevice as selectDeviceAction,
  selectTimeRange as selectTimeRangeAction,
  updateDevice as updateDeviceAction,
} from './actions';
import Segments from './segments';
import init from './startup';
import * as Playback from './playback';
import store from './store';
import * as Cache from './cache';
import * as Demo from '../demo';

export const PortState = CreateStore();

// fire off init method / construct init promises
export const initAuthPromise = Auth.init().then((token) => {
  Request.configure(token);
});
let hasGottenSegmentData = null;
const hasGottenSegmentDataPromise = new Promise(((resolve) => {
  hasGottenSegmentData = function segmentDataHandler() {
    hasGottenSegmentData = null;
    resolve();
  };
}));

store.subscribe(() => {
  const state = store.getState();

  if (hasGottenSegmentData && Segments.hasSegmentMetadata(state)) {
    hasGottenSegmentData();
  }
});

function close(port) {
  if (PortState(port).unlisten) {
    PortState(port).unlisten();
  }
  if (PortState(port).broadcastChannel) {
    PortState(port).broadcastChannel.port1.close();
  }
  port.close();
}

function seek(offset) {
  store.dispatch(Playback.seek(offset));
}

function pause(/* port */) {
  store.dispatch(Playback.pause());
}

function play(speed) {
  store.dispatch(Playback.play(speed));
}

function bufferVideo(isBuffering) {
  store.dispatch(Playback.bufferVideo(isBuffering));
}

function bufferData(isBuffering) {
  store.dispatch(Playback.bufferData(isBuffering));
}

function disableBuffer(data) {
  store.dispatch(Playback.disableBuffer(data));
}

async function hello(data) {
  await Demo.init();
  await initAuthPromise;
  store.dispatch(selectDeviceAction(data.dongleId));

  await Promise.all([
    init(Demo.isDemo()),
    hasGottenSegmentDataPromise
  ]);

  return 'hello';
}

function resolveAnnotation(data) {
  const { annotation, event, route } = data;

  store.dispatch(Segments.resolveAnnotation(annotation, event, route));
}

function selectDevice(dongleId) {
  store.dispatch(selectDeviceAction(dongleId));
}

function updateDevice(device) {
  store.dispatch(updateDeviceAction(device));
}

function selectTimeRange(data) {
  const { start, end } = data;
  store.dispatch(selectTimeRangeAction(start, end));
}

function selectLoop(data) {
  const { startTime, duration } = data;
  store.dispatch(Playback.selectLoop(startTime, duration));
}

function cachePort(data, ports) {
  console.log('Was handed this port!', ports);
  Cache.setCachePort(ports[0]);
}

function stop() {
  console.log('Stopping worker!');
  // if (SegmentTimerStore(state).stopTimer) {
  //   SegmentTimerStore(state).stopTimer();
  //   SegmentTimerStore(state).stopTimer = null;
  // }
}

export const commands = {
  close,
  play,
  pause,
  seek,
  bufferVideo,
  bufferData,
  disableBuffer,
  hello,
  resolve: resolveAnnotation,
  selectDevice,
  selectTimeRange,
  selectLoop,
  updateDevice,
  cachePort,
  stop
};
