import window from 'global/window';
import Event from 'geval/event';
import { partial } from 'ap';

const TimelineSharedWorker = require('./index.sharedworker');
const TimelineWebWorker = require('./index.worker');

const UnloadEvent = Event();
const StateEvent = Event();
window.addEventListener('beforeunload', UnloadEvent.broadcast);

class TimelineInterface {
  constructor (options) {
    this.options = options || {};
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
  async handleCommand (msg) {
    if (!msg.data.command) {
      return false;
    }
    switch (msg.data.command) {
      case 'return-value':
        // implement RPC return values
        break;
      case 'state':
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

  if (typeof TimelineSharedWorker === 'function') {
    worker = new TimelineSharedWorker();
    timeline.isShared = true;
  } else if (typeof TimelineWebWorker === 'function') {
    console.log('Using web worker fallback');
    worker = new TimelineWebWorker();
  } else {
    console.warn('Using fake web workers');
    worker = { port: {} };
  }
  var port = worker.port || worker;

  port.onmessage = timeline.handleMessage.bind(timeline);

  timeline.worker = worker;
  timeline.port = port;

  UnloadEvent.listen(() => timeline.disconnect());
}
