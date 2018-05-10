import Event from 'geval/event';
import CreateStore from 'weakmap-shim/create-store';
import debounce from 'debounce';
import { createStore } from 'redux';
import reduceReducers from 'reduce-reducers';

import Playback from './playback';
import Segments from './segments';

const BroadcastEvent = Event();
const PortState = CreateStore();

const store = createStore(reduceReducers(Playback.reducer, Segments.reducer));

// segments
// start offset
// length
// name
// all other attributes stored in cache entries

setInterval(function () {
  let speed = ~~(Math.random() * 3) / 2;
  console.log('Setting play speed...', speed);
  store.dispatch(Playback.play(speed));
}, 5000);

store.subscribe(function () {
  BroadcastEvent.broadcast({
    command: 'state',
    data: getState()
  });
});

const commands = {
  close: close
};

export function handleMessage (port, msg) {
  console.log('Got this message', msg);

  if (msg.data.command) {
    commands[msg.data.command](port, msg);
  }
}

export function getState () {
  return store.getState();
}

export function createBroadcastPort (port) {
  if (PortState(port).broadcastPort) {
    return PortState(port).broadcastPort;
  }
  var broadcastChannel = null;
  var broadcastPort = null;
  var receiverPort = null;

  debugger;

  if (typeof MessageChannel === 'function') {
    broadcastChannel = new MessageChannel();
    broadcastPort = broadcastChannel.port1;
    receiverPort = broadcastChannel.port2;
  } else {
    broadcastPort = port;
  }
  var unlisten = BroadcastEvent.listen(broadcastPort.postMessage.bind(broadcastPort));

  PortState(port).broadcastPort = receiverPort;
  PortState(port).closePort = closePort;

  return receiverPort;

  function closePort () {
    unlisten();
    if (broadcastChannel) {
      broadcastChannel.port1.close();
    }
  }
}

function close (port) {
  if (PortState(port).unlisten) {
    PortState(port).unlisten();
  }
  if (PortState(port).broadcastChannel) {
    PortState(port).broadcastChannel.port1.close();
  }
  port.close();
}

function setTimespan (port, msg) {
}

function getDefaultStartDate () {
  var d = new Date();
  d.setHours(d.getHours(), 0, 0, 0);

  return new Date(d.getTime() - 1000 * 60 * 60 * 24);
}

function getDefaultEndDate () {
  var d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);

  return d;
}
