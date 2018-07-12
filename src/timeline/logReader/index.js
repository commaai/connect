const Event = require('geval/event');
const LogReaderSharedWorker = require('./logReader.sharedworker');
const LogReaderWorker = require('./logReader.worker');

const DataEvent = Event();

module.exports = getWorker;

getWorker.onData = DataEvent.listen;

var logReader = null;

function getWorker () {
  if (logReader) {
    return logReader;
  }
  if (false && typeof LogReaderSharedWorker === 'function') {
    logReader = new LogReaderSharedWorker();
  } else if (typeof LogReaderWorker === 'function') {
    console.warn('Using web worker fallback');
    logReader = new LogReaderWorker();
  } else {
    throw new Error('Don\'t');
  }

  let channel = new MessageChannel();
  let logPort = channel.port1;
  let apiPort = channel.port2;

  logPort.onmessage = relayMessage;
  logReader.onmessage = handleMessage;

  return apiPort;
}

function handleMessage (msg) {
  DataEvent.broadcast(msg);
}

function relayMessage (msg) {
  logReader.postMessage(msg.data);
}
