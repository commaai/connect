import * as capnp from 'capnp-ts';
import toJSON from '@commaai/capnp-json';
import BufferUtils from 'capnp-split/buffer';
import { Event, Event_Which as EventWhich } from '@commaai/log_reader/capnp/log.capnp';

// IE
if (!Number.MAX_SAFE_INTEGER) {
  Number.MAX_SAFE_INTEGER = (2 ** 53) - 1;
}

function binSearch(index, start, end, milis, nanos) {
  if (start >= end) {
    return start;
  }
  const searchIndex = Math.floor((end - start) / 2) + start;
  // searchIndex wont equal end, only start

  if (milis < index[searchIndex][0]
    || (milis === index[searchIndex][0] && nanos < index[searchIndex][1])) {
    return binSearch(index, start, searchIndex, milis, nanos);
  }
  if (milis > index[searchIndex][0]
    || (milis === index[searchIndex][0] && nanos > index[searchIndex][1])) {
    if (searchIndex === index.length - 1
      || milis < index[searchIndex + 1][0]
      || (milis === index[searchIndex + 1][0] && nanos < index[searchIndex + 1][1])) {
      return searchIndex;
    }
    return binSearch(index, searchIndex + 1, end, milis, nanos);
  }
  return searchIndex;
}

function indexBuffer(index, buffer, bufferIndex) {
  let offset = 0;
  const calibrations = [];
  let lastIndex = index.length ? index.length - 1 : 0;
  // debugger;

  while (offset < buffer.byteLength) {
    const messageBuff = BufferUtils.readMessage(buffer, offset);
    const msg = new capnp.Message(messageBuff, false);
    const event = msg.getRoot(Event);
    const monoTime = event.getLogMonoTime().toString();
    const milis = Number(monoTime.substr(0, monoTime.length - 6));
    const nanos = Number(monoTime.substr(-6, 6));
    const messageSize = messageBuff.byteLength;
    const which = event.which();

    if (which === EventWhich.LIVE_CALIBRATION) {
      calibrations.push(toJSON(event));
    }

    if (!index.length
      || (milis > index[index.length - 1][0]
      || (milis === index[index.length - 1][0] && nanos > index[index.length - 1][1]))) {
      index.push([
        milis,
        nanos,
        offset,
        messageSize,
        bufferIndex,
        which
      ]);
      lastIndex = index.length - 1;
    } else {
      let searchIndex = lastIndex;
      let incAmount = 1;
      // debugger;
      while (searchIndex < index.length - 1
        && (milis > index[searchIndex][0]
        || (milis === index[searchIndex][0] && nanos > index[searchIndex][1]))) {
        incAmount = Math.min(Math.floor(index.length - searchIndex / 2), incAmount * 2);
        searchIndex = Math.min(searchIndex + incAmount, index.length - 1);
      }
      // debugger;
      searchIndex = binSearch(index, searchIndex - incAmount, searchIndex, milis, nanos);
      // debugger;
      searchIndex += 1;
      lastIndex = searchIndex;

      index.splice(searchIndex, 0, [
        milis,
        nanos,
        offset,
        messageSize,
        bufferIndex,
        which
      ]);
    }
    offset += messageSize;
  }

  return calibrations;
}

export function createIndex(_buffer) {
  const buffer = Buffer.from(_buffer);
  const index = [];

  const calibrations = indexBuffer(index, buffer, 0);

  return {
    index,
    buffers: [buffer],
    calibrations
  };
}

export function addToIndex(_index, _newBuff) {
  const newBuff = Buffer.from(_newBuff);
  const index = _index;
  index.buffers.push(newBuff);
  const calibrations = indexBuffer(index.index, newBuff, index.buffers.length - 1);
  index.calibrations = index.calibrations.concat(calibrations);

  return index;
}

export function findMonoTime(index, monoTime, start = 0, end = index.index.length) {
  if (start === index.index.length) {
    return index.index.length - 1;
  }
  if (start >= end) {
    return end;
  }
  // index is floored so always increase start
  const curIndex = Math.floor((end - start) / 2 + start);
  const curMillis = index.index[curIndex][0];
  // we can have duplicates so we treat matches as being too high since we're
  // looking for the first instance of a duplicate
  if (monoTime < curMillis) {
    return findMonoTime(index, monoTime, start, curIndex);
  }
  if (monoTime > curMillis) {
    return findMonoTime(index, monoTime, curIndex + 1, end);
  }

  return curIndex;
}
