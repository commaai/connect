const initialState = require('./initialState');
const Playback = require('./playback');

const ACTION_UPDATE_SEGMENTS = 'update_segments';

const SEGMENT_LENGTH = 1000 * 60;

module.exports = {
  getCurrentSegment, getNextSegment, updateSegments,
  SEGMENT_LENGTH,
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
  var currentSegment = getCurrentSegment(state);
  var nextSegment = getNextSegment(state);

  if (currentSegment) {
    state.route = currentSegment.route
    state.segment = currentSegment.segment;
  } else {
    state.route = false;
    state.segment = 0;
  }
  state.nextSegment = nextSegment;

  return state;
}

function updateSegments () {
  return {
    type: ACTION_UPDATE_SEGMENTS
  };
}

function getNextSegment (state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }

  var segments = state.segments;
  var lastSegment = null;

  for (let i = 0, len = segments.length; i < len; ++i) {
    let thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      return {
        route: thisSegment.route,
        segment: 0,
        startOffset: thisSegment.offset
      };
      break;
    }
    if (thisSegment.offset + thisSegment.length > offset) {
      let segmentIndex = ~~((offset - thisSegment.offset) / SEGMENT_LENGTH);
      if (segmentIndex + 1 < thisSegment.segments) {
        return {
          route: thisSegment.route,
          segment: segmentIndex + 1,
          startOffset: thisSegment.offset + SEGMENT_LENGTH * (segmentIndex + 1)
        };
      }
    }
  }

  return null;
}

function getCurrentSegment (state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }

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
        segment: ~~((offset - thisSegment.offset) / SEGMENT_LENGTH)
      };
    }
  }
}
