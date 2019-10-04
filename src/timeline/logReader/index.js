const Event = require('geval/event');
const LogReaderWorker = require('./logReader.worker');
// const LogReaderSharedWorker = require('./logReader.sharedworker');

const DataEvent = Event();

let logReader = null;

function handleMessage(msg) {
  DataEvent.broadcast(msg);
}

function relayMessage(msg) {
  const port = logReader.port || logReader;
  port.postMessage(msg.data);
}

function getWorker() {
  if (logReader) {
    return logReader;
  }
  // if (typeof LogReaderSharedWorker === 'function' && typeof SharedWorker === 'function') {
  // logReader = new LogReaderSharedWorker();
  if (typeof LogReaderWorker === 'function') {
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

module.exports = getWorker;

getWorker.onData = DataEvent.listen;
