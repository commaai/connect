/* eslint-env worker */
/* eslint-disable no-restricted-globals */
// get the constructor name of the global scope
// this tells us if we're running in a window, shared worker, or web worker
// this probably varries browser to broswer, should be researched...
console.log('Started up!!');
const Event = require('geval/event');
const workerType = self.constructor.name;

const BroadcastEvent = Event();

console.log('Started up', workerType);

self.onmessage = webWorkerInit;
self.onconnect = sharedWorkerInit;

function sharedWorkerInit (e) {
  console.log(e.ports);
  const port = e.ports[0];
  console.log('Definitely working2: Init / on connect hjandler', e);

  port.onmessage = function (msg) {
    console.log('Got msg', msg);
    port.postMessage('someVal');
  }
}

function webWorkerInit (e) {
  console.log('Definitely working: Is web worker');
}
