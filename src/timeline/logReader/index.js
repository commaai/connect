const Event = require('geval/event');
const LogReaderSharedWorker = require('./logReader.sharedworker');
const LogReaderWorker = require('./logReader.worker');

const DataEvent = Event();

module.exports = getWorker;

getWorker.onData = DataEvent.listen;

let logReader = null;

function getWorker() {
  if (logReader) {
    return logReader;
  }
  if (false && typeof LogReaderSharedWorker === 'function' && typeof SharedWorker === 'function') {
    logReader = new LogReaderSharedWorker();
  } else if (typeof LogReaderWorker === 'function') {
    console.warn('Using web worker fallback');
    logReader = new LogReaderWorker();
  } else {
    throw new Error('Don\'t');
  }
  const port = logReader.port || logReader;

  const channel = new MessageChannel();
  const logPort = channel.port1;
  const apiPort = channel.port2;

  logPort.onmessage = relayMessage;
  port.onmessage = handleMessage;

  return apiPort;
}

function handleMessage(msg) {
  DataEvent.broadcast(msg);
}

function relayMessage(msg) {
  const port = logReader.port || logReader;
  port.postMessage(msg.data);
}
