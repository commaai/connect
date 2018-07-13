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
  if (typeof LogReaderSharedWorker === 'function' && typeof SharedWorker === 'function') {
    logReader = new LogReaderSharedWorker();
  } else if (typeof LogReaderWorker === 'function') {
    console.warn('Using web worker fallback');
    logReader = new LogReaderWorker();
  } else {
    throw new Error('Don\'t');
  }
  let port = logReader.port || logReader;

  let channel = new MessageChannel();
  let logPort = channel.port1;
  let apiPort = channel.port2;

  logPort.onmessage = relayMessage;
  port.onmessage = handleMessage;

  return apiPort;
}

function handleMessage (msg) {
  DataEvent.broadcast(msg);
}

function relayMessage (msg) {
  let port = logReader.port || logReader;
  port.postMessage(msg.data);
}
