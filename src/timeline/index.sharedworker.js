/* eslint-env worker */
/* eslint-disable no-restricted-globals */
const API = require('./timeline');

function sharedWorkerInit(e) {
  const port = e.ports[0];

  function close() {
    port.close();
  }
  function postMessage(msg, transferables) {
    port.postMessage(msg, transferables);
  }

  const portInterface = {
    close,
    postMessage
  };

  postMessage({
    command: 'state',
    data: API.getState()
  });

  postMessage({
    command: 'broadcastPort'
  }, [API.createBroadcastPort(port)]);

  port.onmessage = function handleMessage(msg) {
    API.handleMessage(portInterface, msg);
  };
  port.onmessageerror = function handleError(err) {
    console.error('Msgh error!', err);
    close();
  };
}

self.onconnect = sharedWorkerInit;
