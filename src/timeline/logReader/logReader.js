import Event from 'geval/event';
import * as Cache from './cache';

const DataLogEvent = Event();

export const onData = DataLogEvent.listen;

export function handleMessage(port, msg) {
  let entry = null;
  switch (msg.data.command) {
    case 'start':
      entry = Cache.getEntry(msg.data.data.route, msg.data.data.segment, DataLogEvent.broadcast);
      entry.start();
      break;
    case 'touch':
      entry = Cache.getEntry(msg.data.data.route, msg.data.data.segment, DataLogEvent.broadcast);
      entry.touch();
      break;
    default:
      console.warn('Unknown log reader command', msg.data);
      // debugger;
      break;
  }
}
