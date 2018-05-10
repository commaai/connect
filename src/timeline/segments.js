const initialState = require('./initialState');
const Playback = require('./playback');

const SEGMENT_LENGTH = 1000 * 60;

module.exports = {
  segmentForOffset,
  reducer
};

/*
segments look like, but can contain additional data if they want
for example, caching url metadata
{
  route: 'dongleid|date',
  segment: 5
}
*/

function reducer (state = initialState, action) {
  return state;
}

function nextSegment (state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }

  console.log('Figuring out which segment we\'re on for offset', offset);

  var segments = state.segments;
  var curSegment = null;
  var lastSegment = null;

  for (let i = 0, len = segments.length; i < len; ++i) {
    let thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      console.log('Probably first segment of', thisSegment);
      break;
    }
    if (thisSegment.offset + thisSegment.length > offset) {
      let segmentIndex = ~~((offset - thisSegment.offset) / SEGMENT_LENGTH);
      if (segmentIndex < thisSegment.segments) {
        console.log('Next segment in this thing');
      }
      curSegment = {
        route: thisSegment.route,
        segment: segmentIndex,
        offset: (offset - thisSegment.offset) % SEGMENT_LENGTH
      };
      break;
    }
  }
}

function segmentForOffset (state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }

  console.log('Figuring out which segment we\'re on for offset', offset);

  var segments = state.segments;

  for (let i = 0, len = segments.length; i < len; ++i) {
    let thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      break;
    }
    if (thisSegment.offset + thisSegment.length > offset) {
      return {
        route: thisSegment.route,
        segment: ~~((offset - thisSegment.offset) / 1000)
      };
    }
  }
}
