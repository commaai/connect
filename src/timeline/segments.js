const initialState = require('./initialState');
const Playback = require('./playback');

const ACTION_UPDATE_SEGMENTS = 'update_segments';
const ACTION_LOAD_SEGMENT_METADATA = 'load_segment_metadata';
const ACTION_SEGMENT_METADATA = 'segment_metadata';

const SEGMENT_LENGTH = 1000 * 60;

module.exports = {
  // helpers
  getCurrentSegment,
  getNextSegment,
  hasSegmentMetadata,
  parseSegmentMetadata,

  // actions
  updateSegments,
  fetchSegmentMetadata,
  insertSegmentMetadata,

  // constants
  SEGMENT_LENGTH,

  // reducer
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
  switch (action.type) {
    case ACTION_LOAD_SEGMENT_METADATA:
      state.segmentData = {
        promise: action.promise,
        start: action.start,
        end: action.end,
        dongleId: state.dongleId
      };
      break;
    case ACTION_SEGMENT_METADATA:
      state.segmentData = action.data;
      state.segments = action.segments;
      break;
  }
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

  state.range = state.end - state.start;

  return state;
}

function updateSegments () {
  return {
    type: ACTION_UPDATE_SEGMENTS
  };
}

function fetchSegmentMetadata (start, end, promise) {
  return {
    type: ACTION_LOAD_SEGMENT_METADATA,
    start, end, promise
  };
}

function insertSegmentMetadata (data) {
  return {
    type: ACTION_SEGMENT_METADATA,
    segments: segmentsFromMetadata(data),
    data
  };
}

function parseSegmentMetadata (state, segments) {
  console.log(segments);
  segments = segments.map(function (segment) {
    segment.offset = Math.round(segment.start_time_utc) - state.start;
    segment.duration = Math.round(segment.end_time_utc - segment.start_time_utc);
    return segment;
  });
  return {
    start: state.start,
    dongleId: state.dongleId,
    end: state.end,
    segments
  };
}
function segmentsFromMetadata (segmentsData) {
  console.log(segmentsData);
  var curSegment = null;
  var segments = [];
  segmentsData.segments.forEach(function (segment) {
    /*
      route: '99c94dc769b5d96e|2018-04-09--11-29-08',
      offset: 41348000,
      length: 214000,
      segments: 4
    */
    if (!curSegment || curSegment.route !== segment.canonical_route_name) {
      curSegment = {
        offset: segment.offset,
        route: segment.canonical_route_name,
        length: 0,
        segments: 0
      };
      segments.push(curSegment);
    }
    curSegment.length = (segment.offset - curSegment.offset) + segment.duration;
    curSegment.segments++;
  });

  return segments;
}

function hasSegmentMetadata (state) {
  if (!state.segmentData) {
    console.log('So segment data at all');
    return false;
  }
  if (state.dongleId !== state.segmentData.dongleId) {
    console.log('Bad dongle id');;
    return false;
  }
  if (state.start.getTime() < state.segmentData.start.getTime()) {
    console.log('Bad start offset');
    return false;
  }
  if (state.end.getTime() > state.segmentData.end.getTime()) {
    console.log('Bad end offset');
    return false;
  }

  return state.start.getTime() >= state.segmentData.start.getTime() && state.end.getTime() <= state.segmentData.end.getTime();
}

function getNextSegment (state, offset) {
  if (offset === undefined) {
    offset = Playback.currentOffset(state);
  }
  if (!state.segments) {
    return null;
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
  if (!state.segments) {
    return null;
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
