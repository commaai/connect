/* eslint-env worker */
/* eslint-disable no-restricted-globals */
const API = require('./logReader');

function sharedWorkerInit(e) {
  console.log(e.ports);
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

  port.onmessage = function messageHandler(msg) {
    console.log('Got msg', msg);
    API.handleMessage(portInterface, msg);
  };
  port.onmessageerror = function errorHandler(err) {
    console.error('Msgh error!', err);
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
}

self.onconnect = sharedWorkerInit;
