import window from 'global/window';
import Event from 'geval';
import { partial } from 'ap';

const TimelineSharedWorker = require('./index.sharedworker');
const TimelineWebWorker = require('./index.sharedworker');

const UnloadEvent = Event(function (broadcast) {
  window.addEventListener('beforeunload', broadcast);
});

class TimelineInterface {
  constructor (options) {
    this.options = options || {};
    this._initPromise = init(this)
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

  async rpc (msg) {
    // msg that expects a reply
  }

  async postMessage (msg) {
    var port = await this.getPort()
    port.postMessage(msg);
  }

  async handleMessage (msg) {
    switch (msg.data.command) {
      case 'return-value':
        // implement RPC return values
        break;
      case 'broadcastPort':
        // set up dedicated broadcast channel
        this.broadcastPort = msg.ports[0];
        this.broadcastPort.onmessage = this.handleBroadcast.bind(this);
        break;
      default:
        console.log('Unknown message!', msg.data);
    }
  }
  async handleBroadcast (msg) {
    console.log('Data broadcast', msg.data);
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

  if (typeof window.SharedWorker === 'function') {
    worker = new TimelineSharedWorker();
    timeline.isShared = true;
  } else {
    worker = new TimelineWebWorker();
  }
  var port = worker.port || worker;

  port.onmessage = timeline.handleMessage.bind(timeline);

  timeline.worker = worker;
  timeline.port = port;

  UnloadEvent(() => timeline.disconnect());
}
