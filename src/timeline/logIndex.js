import * as capnp from 'capnp-ts';
import BufferUtils from 'capnp-split/buffer';
import { Event } from '@commaai/log_reader/capnp/log.capnp';

// IE
if (!Number.MAX_SAFE_INTEGER) {
  Number.MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
}

export function createIndex (buffer) {
  buffer = Buffer.from(buffer);
  var index = [];

  indexBuffer(index, buffer, 0);

  return {
    index: index,
    buffers: [buffer]
  };
}

export function addToIndex (index, newBuff) {
  newBuff = Buffer.from(newBuff);
  index.buffers.push(newBuff);
  indexBuffer(index.index, newBuff, index.buffers.length - 1);
}

export function findMonoTime (index, monoTime, start, end) {
  if (!start) {
    start = 0;
  }
  if (!end) {
    end = index.index.length;
  }
  if (start === index.index.length) {
    return index.index.length - 1;
  }
  if (start >= end) {
    return end;
  }
  // index is floored so always increase start
  var curIndex = Math.floor((end - start) / 2 + start);
  var curMillis = index.index[curIndex][0];
  // we can have duplicates so we treat matches as being too high since we're
  // looking for the first instance of a duplicate
  if (curMillis === monoTime || monoTime < curMillis) {
    return findMonoTime(index, monoTime, start, curIndex);
  }
  if (monoTime > curMillis) {
    return findMonoTime(index, monoTime, curIndex + 1, end);
  }

  // impossible
  return curIndex;
}

function isSafe (monotime) {
  return monotime >= Number.MAX_SAFE_INTEGER;
}

function indexBuffer (index, buffer, bufferIndex) {
  var startNow = performance.now();
  var offset = 0;
  var startIndex = index.length;

  while (offset < buffer.byteLength) {
    let messageBuff = BufferUtils.readMessage(buffer, offset);
    let msg = new capnp.Message(messageBuff, false);
    let event = msg.getRoot(Event);
    let monoTime = event.getLogMonoTime().toString();
    let milis = Number(monoTime.substr(0, monoTime.length - 6));
    let nanos = Number(monoTime.substr(-6, 6));
    let messageSize = messageBuff.byteLength;

    if (!index.length || (milis > index[index.length - 1][0] || (milis === index[index.length - 1][0] && nanos > index[index.length - 1][1]))) {
      index.push([
        milis,
        nanos,
        offset,
        messageSize,
        bufferIndex
      ]);
    } else {
      let searchIndex = index.length - 2;

      while (searchIndex >= 0 && (milis < index[searchIndex][0] || (milis == index[searchIndex][0] && nanos < index[searchIndex][1]))) {
        searchIndex--;
      }
      searchIndex++;

      index.splice(searchIndex, 0, [
        milis,
        nanos,
        offset,
        messageSize,
        bufferIndex
      ]);
    }
    offset += messageSize;
  }

  var endNow = performance.now();
  var timeDiff = (endNow - startNow);

  // console.log('took', timeDiff, 'ms to index', index.length - startIndex, 'entries');
}
