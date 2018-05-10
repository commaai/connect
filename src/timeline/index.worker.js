/* eslint-env worker */
/* eslint-disable no-restricted-globals */
const API = require('./timeline');

const port = self;
const portInterface = {
  close: close,
  postMessage: postMessage
};

postMessage({
  command: 'state',
  data: API.getState()
});

postMessage({
  command: 'broadcastPort'
}, [API.createBroadcastPort(port)]);

port.onmessage = function (msg) {
  console.log('Got msg', msg);
  API.handleMessage(portInterface, msg);
}

port.onmessageerror = function (e) {
  console.error('Msgh error!', e);
  close();
}

function close () {
  port.close();
}

function postMessage (msg, transferables) {
  port.postMessage(msg, '*', transferables);
}
