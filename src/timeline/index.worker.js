/* eslint-env worker */
/* eslint-disable no-restricted-globals */
const API = require('./timeline');

const port = self;
const portInterface = {
  close: close,
  postMessage: postMessage
};

port.onmessage = function (msg) {
  API.handleMessage(portInterface, msg);
}

port.onmessageerror = function (e) {
  console.error('Msgh error!', e);
  close();
}

postMessage({
  command: 'state',
  data: API.getState()
});

postMessage({
  command: 'broadcastPort'
}, [API.createBroadcastPort(port)]);

function close () {
  port.close();
}

function postMessage (msg, transferables) {
  if (self.window === self) {
    port.postMessage(msg, '*', transferables);
  } else {
    port.postMessage(msg, transferables);
  }
}
