/* eslint-env worker */
/* eslint-disable no-restricted-globals */
const API = require('./logReader');

const port = self;

function close() {
  port.close();
}

function postMessage(msg, transferables) {
  if (self.window === self) {
    port.postMessage(msg, '*', transferables);
  } else {
    port.postMessage(msg, transferables);
  }
}

const portInterface = {
  close,
  postMessage
};

port.onmessage = function messageHandler(msg) {
  // console.log('Got msg', msg);
  API.handleMessage(portInterface, msg);
};

port.onmessageerror = function errorHandler(e) {
  console.error('Msgh error!', e);
  close();
};

API.onData((msg) => {
  let buffer = null;
  if (msg.data.length === 1) {
    // force copy for older versions of node/shim
    buffer = Buffer.from(msg.data);
  } else {
    buffer = Buffer.concat(msg.data);
  }
  postMessage({
    command: 'data',
    route: msg.route,
    segment: msg.segment,
    data: buffer.buffer
  }, [buffer.buffer]);
});
