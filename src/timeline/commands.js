import Auth from '@commaai/my-comma-auth';
import { request as Request } from '@commaai/comma-api'; // eslint-disable-line

import {
  selectDevice as selectDeviceAction,
  selectTimeRange as selectTimeRangeAction,
  updateDevice as updateDeviceAction,
  primeGetSubscriptionAction,
  primeGetPaymentMethodAction,
  primeNavAction,
} from './actions';
import Segments from './segments';
import init from './startup';
import * as Playback from './playback';
import store from './store';
import * as Cache from './cache';
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

function bufferData(isBuffering) {
  store.dispatch(Playback.bufferData(isBuffering));
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

function primeGetSubscription(dongleId, subscription) {
  store.dispatch(primeGetSubscriptionAction(dongleId, subscription));
}

function primeGetPaymentMethod(paymentMethod) {
  store.dispatch(primeGetPaymentMethodAction(paymentMethod));
}

function primeNav(nav = true) {
  store.dispatch(primeNavAction(nav));
}

function resetPlayback() {
  store.dispatch(Playback.resetPlayback());
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
  hello,
  selectDevice,
  selectTimeRange,
  selectLoop,
  updateDevice,
  cachePort,
  stop,
  primeGetSubscription,
  primeGetPaymentMethod,
  primeNav,
  resetPlayback,
};
