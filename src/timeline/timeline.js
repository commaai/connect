const Event = require('geval/event');
const Value = require('observ');
const Struct = require('observ-struct');
const CreateStore = require('weakmap-shim/create-store');
const debounce = require('debounce');

const BroadcastEvent = Event();
const PortState = CreateStore();

const state = Struct({
  start: Value(getDefaultStartDate()),
  end: Value(getDefaultEndDate()),
  playSpeed: Value(0), // 0 = stopped, 1 = playing, 2 = 2x speed... multiplier on speed
  routeName: Value(false),
  offset: Value(0), // in miliseconds from the start
  startTime: Value(Date.now()) // millisecond timestamp in which play began
});

setInterval(function () {
  console.log('Setting play speed...');
  state.playSpeed.set(~~(Math.random() * 3) / 2);
}, 5000);

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
  var broadcastChannel = new MessageChannel();
  var unlisten = BroadcastEvent.listen(function (msg) {
    console.log('Broadcasting state change over msg channel');
    broadcastChannel.port1.postMessage(msg);
  });

  PortState(port).broadcastPort = broadcastChannel.port2;
  PortState(port).closePort = closePort;

  return broadcastChannel.port2;

  function closePort () {
    unlisten();
    broadcastChannel.port1.close();
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
