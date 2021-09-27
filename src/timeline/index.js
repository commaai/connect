/* eslint-disable class-methods-use-this */
import window from 'global/window';
import Event from 'geval/event';

import { storage as AuthStorage } from '@commaai/my-comma-auth';
import * as Playback from './playback';
import { getDongleID, getPrimeNav, getZoom } from '../url';
import { getState, init as initTimeline } from './timeline';
import * as Demo from '../demo';
import { commands } from './commands';
import store from './store';

const StateEvent = Event();
const IndexEvent = Event();
const InitEvent = Event();
const InitPromise = new Promise(((resolve) => {
  InitEvent.listen(resolve);
}));

const startPath = window.location ? window.location.pathname : '';

// helper functions

export class TimelineInterface {
  constructor(options) {
    this.options = options || {};
    this.requestId = 1;
    this.openRequests = {};
    this.initPromise = InitPromise;
  }

  onStateChange = StateEvent.listen
  onIndexed = IndexEvent.listen

  async init(isDemo = false) {
    if (!this.hasInit) {
      this.hasInit = true;

      initTimeline();

      this.readyPromise = commands.hello({
        dongleId: getDongleID(startPath),
        zoom: getZoom(startPath),
        primeNav: getPrimeNav(startPath),
      });

      const token = await AuthStorage.getCommaAccessToken();
      if (!(token || isDemo || getDongleID(startPath))) {
        return new Promise((resolve, reject) => resolve());
      }

      this.setState(store.getState());
      store.subscribe(() => {
        const state = store.getState();
        this.setState(state);
      });

      InitEvent.broadcast(token);
    }
    return this.readyPromise;
  }

  async stop() {
    if (!this.hasInit) {
      return;
    }
    await commands.stop();
    this.hasInit = false;
  }

  async seek(offset) {
    return commands.seek(Math.round(offset));
  }

  async play(speed = 1) {
    return commands.play(speed);
  }

  async pause() {
    return commands.pause();
  }

  async bufferVideo(isBuffering = true) {
    return commands.bufferVideo(isBuffering);
  }

  async selectTimeRange(start, end) {
    return commands.selectTimeRange({ start, end });
  }

  async selectLoop(startTime, duration) {
    return commands.selectLoop({ startTime, duration });
  }

  async selectDevice(dongleId) {
    await this.readyPromise;
    if (this.state.dongleId === dongleId) {
      return true;
    }
    return commands.selectDevice(dongleId);
  }

  async updateDevices(devices) {
    return commands.updateDevices(devices);
  }

  async updateDevice(device) {
    return commands.updateDevice(device,);
  }

  async primeGetSubscription(dongleId, subscription) {
    return commands.primeGetSubscription(dongleId, subscription);
  }

  async primeGetSubscribeInfo(dongleId, subscription) {
    return commands.primeGetSubscribeInfo(dongleId, subscription);
  }

  async primeNav(nav) {
    return commands.primeNav(nav);
  }

  async resetPlayback() {
    return commands.resetPlayback();
  }

  async updateDeviceOnline(dongleId, last_athena_ping, fetched_at) {
    return commands.updateDeviceOnline(dongleId, last_athena_ping, fetched_at);
  }

  setState(state) {
    this.state = state;
    StateEvent.broadcast(state);
  }

  currentOffset() {
    if (this.state) {
      return Playback.currentOffset(this.state);
    }
    return 0;
  }
}
// create instance and expose it
const timeline = new TimelineInterface();
export default timeline;
