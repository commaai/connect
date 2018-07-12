import Event from 'geval/event';
import { partial } from 'ap';
// cache all of the data

var cachePort = null;

const ExpireEvent = Event();
export const onExpire = ExpireEvent.listen;

const listenerMap = {};

export function setCachePort (port) {
  if (cachePort) {
    cachePort.onmessage = null;
  }
  cachePort = port;
  cachePort.onmessage = handleMessage;
}

export function getEntry (route, segment, dataListener) {
  console.log('Getting thing from the place!', route, segment);

  if (!listenerMap[route]) {
    listenerMap[route] = {};
  }
  listenerMap[route][segment] = dataListener;
  touch(route, segment);
  return {
    start: partial(start, route, segment)
  };
}

function expire (route, segment) {
  cachePort.postMessage({
    command: 'expire',
    data: { route, segment }
  });
}

function start (route, segment) {
  cachePort.postMessage({
    command: 'start',
    data: { route, segment }
  });
}

function touch (route, segment) {
  cachePort.postMessage({
    command: 'touch',
    data: { route, segment }
  });
}

function handleMessage (msg) {
  switch (msg.data.command) {
    case 'expire':
      ExpireEvent.broadcast(msg.data.data);
      break;
    case 'data':
      break;
  }
}
