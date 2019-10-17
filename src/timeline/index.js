/* eslint-disable class-methods-use-this */
import window from 'global/window';
import Event from 'geval/event';
import * as capnp from 'capnp-ts';
import { Event as CapnpEvent, Event_Which as EventWhich } from '@commaai/log_reader/capnp/log.capnp';
import toJSON from '@commaai/capnp-json';

import { storage as AuthStorage } from '@commaai/my-comma-auth';
import * as Playback from './playback';
import * as LogIndex from './logIndex';
import * as Cache from './cache';
import { getDongleID, getZoom } from '../url';
import { getState } from './timeline';
import { commands } from './commands';
import store from './store';

// const TimelineSharedWorker = require('./index.sharedworker');
const LogReaderWorker = require('./logReader');

const UnloadEvent = Event();
const StateEvent = Event();
const IndexEvent = Event();
const InitEvent = Event();
const InitPromise = new Promise(((resolve) => {
  InitEvent.listen(resolve);
}));

window.addEventListener('beforeunload', UnloadEvent.broadcast);
const startPath = window.location ? window.location.pathname : '';

// helper functions

function noop() { }

async function initWorker(_t, isDemo) {
  const t = _t;

  const token = await AuthStorage.getCommaAccessToken();
  if (!(token || isDemo)) {
    return new Promise(noop);
  }

  // if (false && typeof TimelineSharedWorker === 'function') {
  //   worker = new TimelineSharedWorker();
  //   t.isShared = true;
  //   t.logReader = new LogReaderWorker();
  if (typeof LogReaderWorker === 'function') {
    t.logReader = new LogReaderWorker();
  }

  // broadcast message
  // handle message
  // cache port
  commands.cachePort(null, [t.logReader.port || t.logReader]);

  LogReaderWorker.onData((msg) => {
    t.handleData(msg);
  });

  UnloadEvent.listen(() => t.disconnect());
  Cache.onExpire(t.expire.bind(t));
  t.setState(getState());
  store.subscribe(() => {
    const state = store.getState();
    t.setState(state);
  });

  InitEvent.broadcast(token);
  return t;
}

async function init(t, isDemo) {
  await initWorker(t, isDemo);
}

class TimelineInterface {
  constructor(options) {
    this.options = options || {};
    this.buffers = {};
    this.requestId = 1;
    this.openRequests = {};
    this.initPromise = InitPromise;
    this.readyPromise = commands.hello({
      dongleId: getDongleID(startPath),
      zoom: getZoom(startPath),
    });
  }

  onStateChange = StateEvent.listen

  onIndexed = IndexEvent.listen

  async init(isDemo) {
    if (!this.hasInit) {
      this.hasInit = true;
      this.isDemo = isDemo;
      init(this, this.isDemo);
    }
    return this.readyPromise;
  }

  async stop() {
    if (!this.hasInit) {
      return;
    }
    await commands.stop();
    this.hasInit = false;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  async getPort() {
    await this.initPromise;
    return this.port;
  }

  async disconnect() {
    return commands.close();
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

  async disableBuffer() {
    return commands.disableBuffer(true);
  }

  async bufferVideo(isBuffering = true) {
    return commands.bufferVideo(isBuffering);
  }

  async bufferData(isBuffering = true) {
    return commands.bufferData(isBuffering);
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

  async resolveAnnotation(annotation, event, route) {
    return commands.resolve({ annotation, event, route });
  }

  async updateDevice(device) {
    return commands.updateDevice(device,);
  }

  setState(state) {
    this.state = state;
    StateEvent.broadcast(state);
    if (this.logReader) {
      const port = this.logReader.port || this.logReader;
      if (this.state.route) {
        port.postMessage({
          command: 'touch',
          data: {
            route: this.state.route,
            segment: this.state.segment,
          }
        });
      }
      if (this.state.nextSegment) {
        port.postMessage({
          command: 'touch',
          data: {
            route: this.state.nextSegment.route,
            segment: this.state.nextSegment.segment,
          }
        });
      }
    }
  }

  expire(data) {
    console.log('Expiring cache entry', data);
    if (this.buffers[data.route] && this.buffers[data.route][data.segment]) {
      delete this.buffers[data.route][data.segment];
    }
  }

  handleCommand(msg) {
    if (!msg.data.command) {
      return false;
    }
    switch (msg.data.command) {
      case 'data':
        // log data stream
        this.handleData(msg);
        break;
      case 'return-value':
        // implement RPC return values
        // is this needed?
        if (this.openRequests[msg.data.requestId]) {
          this.openRequests[msg.data.requestId](msg.data.data);
          delete this.openRequests[msg.data.requestId];
        } else {
          console.error('Got a reply for invalid RPC', msg.data.requestId);
        }
        break;
      case 'broadcastPort':
        // set up dedicated broadcast channel
        [this.broadcastPort] = msg.ports;
        this.broadcastPort.onmessage = this.handleBroadcast.bind(this);
        this.broadcastPort.onmessageerror = console.error.bind(console);
        break;
      default:
        return false;
    }
    return true;
  }

  async handleBroadcast(msg) {
    if (this.handleCommand(msg)) {
      return;
    }
    console.log('Unknown message!', msg.data);
  }

  async handleData(msg) {
    if (!this.buffers[msg.data.route]) {
      this.buffers[msg.data.route] = {};
    }
    if (!this.buffers[msg.data.route][msg.data.segment]) {
      this.buffers[msg.data.route][msg.data.segment] = LogIndex.createIndex(msg.data.data);
    } else {
      LogIndex.addToIndex(this.buffers[msg.data.route][msg.data.segment], msg.data.data);
    }
    IndexEvent.broadcast(msg.data.route);
  }

  getStartMonoTime(route, segment = 0) {
    if (!this.buffers[route]
      || !this.buffers[route][segment]
      || !this.buffers[route][segment].index) {
      return 0;
    }
    return this.buffers[route][segment].index[0][0];
  }

  getIndex() {
    if (!this.state || !this.state.route) {
      return [];
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return [];
    }

    return this.buffers[this.state.route][this.state.segment].index;
  }

  currentLogMonoTime() {
    if (!this.state || !this.state.route) {
      return null;
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return null;
    }
    let offset = this.currentOffset();
    const [segment] = this.state.segments.filter((a) => a.route === this.state.route);
    const logIndex = this.buffers[this.state.route][this.state.segment];
    if (!segment) {
      return null;
    }
    offset -= segment.offset;
    const startTime = logIndex.index[0][0];

    return offset + startTime;
  }

  lastEvents(_eventCount = 10) {
    const logMonoTime = this.currentLogMonoTime();
    if (!logMonoTime) {
      return [];
    }
    const logIndex = this.getLogIndex();

    const curIndex = LogIndex.findMonoTime(logIndex, logMonoTime);
    const eventCount = Math.min(_eventCount, curIndex);

    return [...Array(eventCount)].map((u, i) => this.getEvent(curIndex - i, logIndex));
  }

  getLogIndex() {
    return this.buffers[this.state.route]
      ? this.buffers[this.state.route][this.state.segment]
      : null;
  }

  getNextLogIndex() {
    if (!this.state.nextSegment) {
      return null;
    }
    return this.buffers[this.state.nextSegment.route]
      ? this.buffers[this.state.nextSegment.route][this.state.nextSegment.segment]
      : null;
  }

  getEvent(index, _logIndex) {
    // millis, nanos, offset, len, buffer
    const logIndex = _logIndex || this.buffers[this.state.route][this.state.segment];
    if (index < 0 || index >= logIndex.index.length) {
      // console.log('Invalid event index', index);
      return null;
    }
    const entry = logIndex.index[index];
    const buffer = logIndex.buffers[entry[4]].slice(entry[2], entry[2] + entry[3]);
    const msg = new capnp.Message(buffer, false);
    const event = msg.getRoot(CapnpEvent);
    return toJSON(event);
  }

  currentOffset() {
    if (this.state) {
      return Playback.currentOffset(this.state);
    }
    return 0;
  }

  timestampToOffset(timestamp) {
    if (this.state) {
      return Playback.timestampToOffset(this.state, timestamp);
    }
    return 0;
  }

  currentInitData() {
    if (!this.state || !this.state.route) {
      return null;
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return null;
    }

    const [segment] = this.state.segments.filter((a) => a.route === this.state.route);
    if (!segment) {
      return null;
    }

    // check if any buffered logs have the initdata packet
    const curSegLog = this.buffers[this.state.route][this.state.segment];
    const entry = curSegLog.index[0];
    if (entry[5] !== EventWhich.INIT_DATA) {
      return null;
    }

    const buffer = curSegLog.buffers[entry[4]].slice(entry[2], entry[2] + entry[3]);
    const msg = new capnp.Message(buffer, false);
    const event = msg.getRoot(CapnpEvent);

    let initData = toJSON(event);
    // Cast params key-value pointers to Text, as capnp-ts does not yet
    // apply parameterized struct types like we use for
    // params: Map(Text, Text)
    initData = Object.create(initData);
    Object.defineProperty(initData, 'InitData', { writable: true, value: Object.create(initData.InitData) });
    Object.defineProperty(initData.InitData, 'Params', { writable: true, value: Object.create(initData.InitData.Params) });
    const parsedEntries = initData.InitData.Params.Entries.map((_paramEntry) => {
      if (!_paramEntry.Key.byteOffset || !_paramEntry.Value.byteOffset) {
        return null;
      }
      const paramEntry = Object.create(_paramEntry);
      Object.defineProperty(paramEntry, 'Key', {
        writable: false,
        value: capnp.Text.fromPointer(paramEntry.Key).get()
      });
      Object.defineProperty(paramEntry, 'Value', {
        writable: true,
        value: capnp.Text.fromPointer(paramEntry.Value).get()
      });

      return paramEntry;
    }).filter((paramEntry) => !!paramEntry);
    Object.defineProperty(initData.InitData.Params, 'Entries', { writable: true, value: parsedEntries });

    return initData;
  }

  currentModel() {
    return this.getEventByType(EventWhich.MODEL, 1000);
  }

  currentLive20() {
    return this.getEventByType(EventWhich.LIVE20, 1000);
  }

  currentLive100() {
    return this.getEventByType(EventWhich.LIVE100, 1000);
  }

  currentLiveMapData() {
    return this.getEventByType(EventWhich.LIVE_MAP_DATA, 4000);
  }

  currentMPC() {
    return this.getEventByType(EventWhich.LIVE_MPC, 1000);
  }

  currentCarState() {
    return this.getEventByType(EventWhich.CAR_STATE, 1000);
  }

  currentDriverMonitoring() {
    return this.getEventByType(EventWhich.DRIVER_MONITORING, 1000);
  }

  currentThumbnail() {
    return this.getEventByType(EventWhich.THUMBNAIL, 6000);
  }

  getEventByType(which, maxTimeDiff = -1) {
    if (!this.state || !this.state.route) {
      return null;
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return null;
    }
    const monoTime = this.currentLogMonoTime();
    let offset = this.currentOffset();
    const [segment] = this.state.segments.filter((a) => a.route === this.state.route);
    if (!segment) {
      return null;
    }

    for (let curSegNum = this.state.segment; curSegNum >= 0; --curSegNum) {
      const logIndex = this.buffers[this.state.route][curSegNum];
      if (!logIndex) {
        return null;
      }
      offset -= segment.offset;
      const startTime = logIndex.index[0][0];
      const logMonoTime = offset + startTime;
      let curIndex = logIndex.index.length - 1;
      if (curSegNum === this.state.segment) {
        curIndex = LogIndex.findMonoTime(logIndex, logMonoTime);
      }

      for (curIndex; curIndex >= 0; --curIndex) {
        const entry = logIndex.index[curIndex];
        if (maxTimeDiff !== -1 && monoTime - entry[0] > maxTimeDiff) {
          return null;
        }
        if (entry[5] === which) {
          const buffer = logIndex.buffers[entry[4]].slice(entry[2], entry[2] + entry[3]);
          const msg = new capnp.Message(buffer, false);
          const event = msg.getRoot(CapnpEvent);
          return toJSON(event);
        }
      }
    }

    return null;
  }

  getCalibration() {
    if (!this.state || !this.state.route) {
      return null;
    }
    const indexes = this.buffers[this.state.route];

    if (!indexes) {
      return null;
    }

    for (let i = 0, keys = Object.keys(indexes), len = keys.length; i < len; ++i) {
      const index = indexes[keys[i]];
      if (index.calibrations && index.calibrations.length) {
        return index.calibrations[index.calibrations.length - 1];
      }
    }
    return null;
  }
}
// create instance and expose it
const timeline = new TimelineInterface();
export default timeline;
