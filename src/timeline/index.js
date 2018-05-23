import window from 'global/window';
import Event from 'geval/event';
import { partial } from 'ap';
import * as capnp from 'capnp-ts';
import { Event as CapnpEvent } from '@commaai/log_reader/capnp/log.capnp';
import toJSON from 'capnp-json';

import { getCommaAccessToken } from '../api/auth';
import * as Playback from './playback';
import * as LogIndex from './logIndex';

const TimelineSharedWorker = require('./index.sharedworker');
const TimelineWebWorker = require('./index.worker');

const UnloadEvent = Event();
const StateEvent = Event();
window.addEventListener('beforeunload', UnloadEvent.broadcast);

class TimelineInterface {
  constructor (options) {
    this.options = options || {};
    this.buffers = {};
    this._initPromise = init(this)
  }
  onStateChange = StateEvent.listen

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

  async rpc (msg) {
    // msg that expects a reply
  }

  async postMessage (msg) {
    var port = await this.getPort()
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
        break;
      case 'state':
        this.state = msg.data.data;
        StateEvent.broadcast(msg.data.data);
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
    console.log(this.buffers[msg.data.route][msg.data.segment].index.length);
    console.log('Got data for', msg.data.route, msg.data.segment, ':', msg.data.data.byteLength);
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
  lastEvents (eventCount = 10, offset = this.currentOffset()) {
    if (!this.state || !this.state.route) {
      return [];
    }
    if (!this.buffers[this.state.route] || !this.buffers[this.state.route][this.state.segment]) {
      return [];
    }
    var segment = this.state.segments.filter((a) => a.route === this.state.route);
    var logIndex = this.buffers[this.state.route][this.state.segment];
    segment = segment[0];
    if (!segment) {
      return [];
    }
    offset -= segment.offset;
    var startTime = logIndex.index[0][0];
    var logMonoTime = offset + startTime;

    var curIndex = LogIndex.findMonoTime(logIndex, logMonoTime);
    eventCount = Math.min(eventCount, curIndex);

    return [...Array(eventCount)].map((u, i) => {
      // millis, micros, offset, len, buffer
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
}
// create instance and expose it
var timeline = new TimelineInterface();
export default timeline;

// helper functions

async function init (timeline) {
  await initWorker(timeline);
}

async function initWorker (timeline) {
  var worker = null;

  await getCommaAccessToken();

  if (false && typeof TimelineSharedWorker === 'function') {
    worker = new TimelineSharedWorker();
    timeline.isShared = true;
  } else if (typeof TimelineWebWorker === 'function') {
    console.warn('Using web worker fallback');
    worker = new TimelineWebWorker();
  } else {
    console.warn('Using fake web workers, this is probably a node/test environment');
    worker = { port: { postMessage: noop } };
  }
  var port = worker.port || worker;

  port.onmessage = timeline.handleMessage.bind(timeline);
  // port.postMessage({
  //   command: 'hello',
  //   data: {
  //     token: await getCommaAccessToken()
  //   }
  // });

  timeline.worker = worker;
  timeline.port = port;

  UnloadEvent.listen(() => timeline.disconnect());
}

function noop () { }
