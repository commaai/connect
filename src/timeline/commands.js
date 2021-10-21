import Auth from '@commaai/my-comma-auth';
import { request as Request } from '@commaai/comma-api'; // eslint-disable-line

import {
  selectDevice as selectDeviceAction,
  selectTimeRange as selectTimeRangeAction,
  updateDevice as updateDeviceAction,
  updateDevices as updateDevicesAction,
  primeGetSubscriptionAction,
  primeGetSubscribeInfoAction,
  primeNavAction,
  updateDeviceOnlineAction,
} from './actions';
import Segments from './segments';
import init from './startup';
import * as Playback from './playback';
import store from './store';
import * as Demo from '../demo';

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

async function hello(data) {
  await initAuthPromise;
  store.dispatch(selectDeviceAction(data.dongleId));

  await Promise.all([
    init(Demo.isDemo()),
    hasGottenSegmentDataPromise
  ]);

  return 'hello';
}

function selectDevice(dongleId) {
  store.dispatch(selectDeviceAction(dongleId));
}

function updateDevices(devices) {
  store.dispatch(updateDevicesAction(devices));
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

function primeGetSubscription(dongleId, subscription) {
  store.dispatch(primeGetSubscriptionAction(dongleId, subscription));
}

function primeGetSubscribeInfo(dongleId, subscribeInfo) {
  store.dispatch(primeGetSubscribeInfoAction(dongleId, subscribeInfo));
}

function primeNav(nav = true) {
  store.dispatch(primeNavAction(nav));
}

function resetPlayback() {
  store.dispatch(Playback.resetPlayback());
}

function updateDeviceOnline(dongleId, last_athena_ping, fetched_at) {
  store.dispatch(updateDeviceOnlineAction(dongleId, last_athena_ping, fetched_at));
}

function stop() {
  console.log('Stopping worker!');
}

export const commands = {
  close,
  play,
  pause,
  seek,
  bufferVideo,
  hello,
  selectDevice,
  selectTimeRange,
  selectLoop,
  updateDevices,
  updateDevice,
  stop,
  primeGetSubscription,
  primeGetSubscribeInfo,
  primeNav,
  resetPlayback,
  updateDeviceOnline,
};
