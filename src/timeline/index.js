import qs from 'query-string';
import window from 'global/window';
import Event from 'geval/event';
import { partial } from 'ap';
import * as capnp from 'capnp-ts';
import { Event as CapnpEvent, Event_Which } from '@commaai/log_reader/capnp/log.capnp';
import toJSON from '@commaai/capnp-json';

import { storage as AuthStorage } from '@commaai/my-comma-auth';
import * as Playback from './playback';
import * as LogIndex from './logIndex';
import { getDongleID, getZoom } from '../url';
import { isDemo } from '../demo';

const TimelineSharedWorker = require('./index.sharedworker');
const TimelineWebWorker = require('./index.worker');
const LogReaderWorker = require('./logReader');

const UnloadEvent = Event();
const StateEvent = Event();
const IndexEvent = Event();
const InitEvent = Event();
const InitPromise = new Promise(function (resolve, reject) {
  InitEvent.listen(resolve);
});

window.addEventListener('beforeunload', UnloadEvent.broadcast);
var startPath = window.location ? window.location.pathname : '';

class TimelineInterface {
  constructor (options) {
    this.options = options || {};
    this.buffers = {};
    this.requestId = 1;
    this.openRequests = {};
    this._initPromise = InitPromise;
    this._readyPromise = this.rpc({
      command: 'hello',
      data: {
        dongleId: getDongleID(startPath),
        zoom: getZoom(startPath),
      }
    });
  }

  onStateChange = StateEvent.listen
  onIndexed = IndexEvent.listen

  async init (isDemo) {
    if (!this.hasInit) {
      this.hasInit = true;
      this.isDemo = isDemo;
      init(this, this.isDemo);
    }
    return this._readyPromise;
  }

  async getPort () {
    await this._initPromise;
    return this.port;
  }

  async getValue () {
    return this.postMessage({
      foo: 'bar'
    });
  }

  async disconnect () {
    return this.postMessage({
      command: 'close'
    });
  }

  async seek (offset) {
    return this.postMessage({
      command: 'seek',
      data: Math.round(offset)
    });
  }

  async play (speed = 1) {
    return this.postMessage({
      command: 'play',
      data: speed
    });
  }

  async pause () {
    return this.postMessage({
      command: 'pause'
    });
  }

  async selectTimeRange (start, end) {
    return this.postMessage({
      command: 'selectTimeRange',
      data: {
        start, end
      }
    });
  }

  async selectLoop (startTime, duration) {
    return this.postMessage({
      command: 'selectLoop',
      data: {
        startTime, duration
      }
    });
  }

  async selectDevice (dongleId) {
    await this._readyPromise;
    if (this.state.dongleId === dongleId) {
      return;
    }
    return this.postMessage({
      command: 'selectDevice',
      data: dongleId
    });
  }

  async resolveAnnotation (annotation, event, route) {
    return this.postMessage({
      command: 'resolve',
      data: { annotation, event, route }
    });
  }

  async updateDevice (device) {
    return this.postMessage({
      command: 'updateDevice',
      data: device,
    });
  }

  async rpc (msg) {
    // msg that expects a reply
    return new Promise((resolve, reject) => {
      let requestId = this.requestId++;
      this.openRequests[requestId] = resolve;
      this.postMessage({
        ...msg,
        requestId
      });
    });
  }

  async postMessage (msg) {
    var port = await this.getPort();
    port.postMessage(msg);
  }

  async handleMessage (msg) {
    if (this.handleCommand(msg)) {
      return;
    }
    console.log('Unknown message!', msg.data);
  }
  handleCommand (msg) {
    if (!msg.data.command) {
      return false;
    }
    switch (msg.data.command) {
      case 'expire':
        // cached segment is expiring because we haven't watched it in a while...
        console.log('Expiring cache entry', msg.data);
        if (this.buffers[msg.data.route] && this.buffers[msg.data.route][msg.data.segment]) {
          delete this.buffers[msg.data.route][msg.data.segment];
        }
        break;
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
      case 'state':
        this.state = msg.data.data;
        StateEvent.broadcast(msg.data.data);
        if (this.logReader) {
          let port = this.logReader.port || this.logReader;
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
        break;
      case 'broadcastPort':
        // set up dedicated broadcast channel
        this.broadcastPort = msg.ports[0];
        this.broadcastPort.onmessage = this.handleBroadcast.bind(this);
        this.broadcastPort.onmessageerror = console.error.bind(console);
        break;
      default:
        return false;
    }
    return true;
  }
  async handleBroadcast (msg) {
    if (this.handleCommand(msg)) {
      return;
    }
    console.log('Unknown message!', msg.data);
  }
  async handleData (msg) {
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
  getStartMonoTime (route, segment = 0) {
    if (!this.buffers[route] || !this.buffers[route][segment] || !this.buffers[route][segment].index) {
      return 0;
    }
    return this.buffers[route][segment].index[0][0];
  }
  getIndex () {
    if (!this.state || !this.state.route) {
      return [];
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return [];
    }

    return this.buffers[this.state.route][this.state.segment].index;
  }
  currentLogMonoTime () {
    if (!this.state || !this.state.route) {
      return null;
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return null;
    }
    var offset = this.currentOffset();
    var segment = this.state.segments.filter((a) => a.route === this.state.route);
    var logIndex = this.buffers[this.state.route][this.state.segment];
    segment = segment[0];
    if (!segment) {
      return null;
    }
    offset -= segment.offset;
    var startTime = logIndex.index[0][0];

    return offset + startTime;
  }
  lastEvents (eventCount = 10) {
    var logMonoTime = this.currentLogMonoTime();
    if (!logMonoTime) {
      return [];
    }
    var logIndex = this.buffers[this.state.route][this.state.segment];

    var curIndex = LogIndex.findMonoTime(logIndex, logMonoTime);
    eventCount = Math.min(eventCount, curIndex);

    return [...Array(eventCount)].map((u, i) => {
      // millis, nanos, offset, len, buffer
      var entry = logIndex.index[curIndex - i];
      var buffer = logIndex.buffers[entry[4]].slice(entry[2], entry[2] + entry[3]);
      var msg = new capnp.Message(buffer, false);
      var event = msg.getRoot(CapnpEvent);
      return toJSON(event);
    });
  }
  currentOffset () {
    if (this.state) {
      return Playback.currentOffset(this.state);
    } else {
      return 0;
    }
  }
  timestampToOffset (timestamp) {
    if (this.state) {
      return Playback.timestampToOffset(this.state, timestamp);
    } else {
      return 0;
    }
  }
  currentInitData () {
    if (!this.state || !this.state.route) {
      return;
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return;
    }

    var segment = this.state.segments.filter((a) => a.route === this.state.route);
    segment = segment[0];
    if (!segment) {
      return;
    }

    // check if any buffered logs have the initdata packet
    var curSegLog = this.buffers[this.state.route][this.state.segment];
    var entry = curSegLog.index[0];
    if (entry[5] !== Event_Which.INIT_DATA) {
      return;
    }

    let buffer = curSegLog.buffers[entry[4]].slice(entry[2], entry[2] + entry[3]);
    var msg = new capnp.Message(buffer, false);
    var event = msg.getRoot(CapnpEvent);

    var initData = toJSON(event);
    // Cast params key-value pointers to Text, as capnp-ts does not yet
    // apply parameterized struct types like we use for
    // params: Map(Text, Text)
    initData = Object.create(initData);
    Object.defineProperty(initData, 'InitData', {writable: true, value: Object.create(initData.InitData)});
    Object.defineProperty(initData.InitData, 'Params', {writable: true, value: Object.create(initData.InitData.Params)});
    var parsedEntries = initData.InitData.Params.Entries.map((entry) => {
      entry = Object.create(entry);
      Object.defineProperty(entry, 'Key', {
        writable: false,
        value: capnp.Text.fromPointer(entry.Key).get()
      });
      Object.defineProperty(entry, 'Value', {
        writable: true,
        value: capnp.Text.fromPointer(entry.Value).get()
      })

      return entry;
    });
    Object.defineProperty(initData.InitData.Params, 'Entries', {writable: true, value: parsedEntries});

    return initData;
  }
  currentModel () {
    return this.getEventByType(Event_Which.MODEL, 1000);
  }
  currentLive20 () {
    return this.getEventByType(Event_Which.LIVE20, 1000);
  }
  currentLive100 () {
    return this.getEventByType(Event_Which.LIVE100, 1000);
  }
  currentLiveMapData () {
    return this.getEventByType(Event_Which.LIVE_MAP_DATA, 4000);
  }
  currentMPC () {
    return this.getEventByType(Event_Which.LIVE_MPC, 1000);
  }
  currentCarState () {
    return this.getEventByType(Event_Which.CAR_STATE, 1000);
  }
  getEventByType (which, maxTimeDiff = -1) {
    if (!this.state || !this.state.route) {
      return;
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return;
    }
    var monoTime = this.currentLogMonoTime()
    var offset = this.currentOffset();
    var segment = this.state.segments.filter((a) => a.route === this.state.route);
    segment = segment[0];
    if (!segment) {
      return;
    }

    for (let curSegNum = this.state.segment; curSegNum >= 0; --curSegNum) {
      var logIndex = this.buffers[this.state.route][curSegNum];
      if (!logIndex) {
        return;
      }
      offset -= segment.offset;
      var startTime = logIndex.index[0][0];
      var logMonoTime = offset + startTime;
      var curIndex = logIndex.index.length - 1;
      if (curSegNum === this.state.segment) {
        curIndex = LogIndex.findMonoTime(logIndex, logMonoTime);
      }

      for (curIndex; curIndex >= 0; --curIndex) {
        let entry = logIndex.index[curIndex];
        if (maxTimeDiff !== -1 && monoTime - entry[0] > maxTimeDiff) {
          return;
        }
        if (entry[5] === which) {
          let buffer = logIndex.buffers[entry[4]].slice(entry[2], entry[2] + entry[3]);
          var msg = new capnp.Message(buffer, false);
          var event = msg.getRoot(CapnpEvent);
          return toJSON(event);
        }
      }
    }
  }
  getCalibration (route) {
    if (!this.state || !this.state.route) {
      return;
    }
    var indexes = this.buffers[this.state.route];

    if (!indexes) {
      return;
    }

    for (let i = 0, keys = Object.keys(indexes), len = keys.length; i < len; ++i) {
      let index = indexes[keys[i]];
      if (index.calibrations && index.calibrations.length) {
        return index.calibrations[index.calibrations.length - 1];
      }
    }
  }
}
// create instance and expose it
var timeline = new TimelineInterface();
export default timeline;

// helper functions

async function init (timeline, isDemo) {
  await initWorker(timeline, isDemo);
}

async function initWorker (timeline, isDemo) {
  var worker = null;
  var logReader = null;

  var token = await AuthStorage.getCommaAccessToken();
  if ( !(token || isDemo) ) {
    return new Promise(noop);
  }

  if (false && typeof TimelineSharedWorker === 'function') {
    worker = new TimelineSharedWorker();
    timeline.isShared = true;
    timeline.logReader = new LogReaderWorker();
  } else if (typeof TimelineWebWorker === 'function') {
    console.warn('Using web worker fallback');
    worker = new TimelineWebWorker();
    timeline.logReader = new LogReaderWorker();
  } else {
    console.warn('Using fake web workers, this is probably a node/test environment');
    worker = { port: { postMessage: noop } };
  }
  var port = worker.port || worker;

  port.onmessage = timeline.handleMessage.bind(timeline);

  timeline.worker = worker;
  timeline.port = port;

  LogReaderWorker.onData(function (msg) {
    timeline.handleData(msg);
  });
  if (timeline.logReader) {
    port.postMessage({
      command: 'cachePort'
    }, [timeline.logReader.port || timeline.logReader]);
  }
  UnloadEvent.listen(() => timeline.disconnect());
  InitEvent.broadcast(token);
}

function noop () { }
