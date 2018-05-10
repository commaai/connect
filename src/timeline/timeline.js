const Event = require('geval/event');
const Value = require('observ');
const Struct = require('observ-struct');
const CreateStore = require('weakmap-shim/create-store');
const debounce = require('debounce');

const Playback = require('./playback');

const BroadcastEvent = Event();
const PortState = CreateStore();

const state = Struct({
  start: Value(getDefaultStartDate()),
  end: Value(getDefaultEndDate()),
  routeName: Value(false),
  playSpeed: Value(0), // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
  offset: Value(0), // in miliseconds from the start
  startTime: Value(Date.now()) // millisecond timestamp in which play began
});

// segments
// start offset
// length
// name
// all other attributes stored in cache entries

// setInterval(function () {
//   console.log('Setting play speed...');
//   Playback.play(state, ~~(Math.random() * 3) / 2);
// }, 5000);

module.exports = {
  handleMessage,
  getState,
  createBroadcastPort
};

state(debounce(function () {
  BroadcastEvent.broadcast({
    command: 'state',
    data: state()
  });
}));

state.routeName(function (newRoute) {
  changeRoute(newRoute);
});

const commands = {
  close: close
};

function handleMessage (port, msg) {
  console.log('Got this message', msg);

  if (msg.data.command) {
    commands[msg.data.command](port, msg);
  }
}

function createBroadcastPort (port) {
  if (PortState(port).broadcastPort) {
    return PortState(port).broadcastPort;
  }
  var broadcastChannel = null;
  var broadcastPort = null;
  if (typeof MessageChannel === 'function') {
    broadcastChannel = new MessageChannel();
    broadcastPort = broadcastChannel.port2;
  } else {
    broadcastPort = port;
  }
  var unlisten = BroadcastEvent.listen(function (msg) {
    broadcastPort.postMessage(msg);
  });

  PortState(port).broadcastPort = broadcastPort;
  PortState(port).closePort = closePort;

  return broadcastPort;

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

function getState () {
  return state();
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
