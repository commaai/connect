import Event from 'geval/event';
import { partial } from 'ap';
// cache all of the data

let cachePort = null;

const ExpireEvent = Event();
export const onExpire = ExpireEvent.listen;

function handleMessage(msg) {
  if (!msg || !msg.data) {
    return;
  }
  switch (msg.data.command) {
    case 'expire':
      ExpireEvent.broadcast(msg.data.data);
      break;
    default:
      break;
  }
}

export function setCachePort(port) {
  if (cachePort) {
    cachePort.onmessage = null;
  }
  cachePort = port;
  cachePort.onmessage = handleMessage;
}

function start(route, segment) {
  cachePort.postMessage({
    command: 'start',
    data: { route, segment }
  });
}

function touch(route, segment) {
  cachePort.postMessage({
    command: 'touch',
    data: { route, segment }
  });
}

export function getEntry(route, segment) {
  touch(route, segment);
  return {
    start: partial(start, route, segment)
  };
}
