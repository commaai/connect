/* eslint-env worker */
/* eslint-disable no-restricted-globals */
const API = require('./timeline');

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
  API.handleMessage(portInterface, msg);
};

port.onmessageerror = function errorHandler(e) {
  console.error('Msgh error!', e);
  close();
};

postMessage({
  command: 'state',
  data: API.getState()
});

postMessage({
  command: 'broadcastPort'
}, [API.createBroadcastPort(port)]);
