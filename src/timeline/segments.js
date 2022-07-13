import * as Types from '../actions/types';

export const SEGMENT_LENGTH = 1000 * 60;

/*
segments look like, but can contain additional data if they want
for example, caching url metadata
{
  route: 'dongleid|date',
  segment: 5
}
*/

// duplicate from `timeline/playback.js` because of circular import
function currentOffset(state) {
  let offset = null;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime - state.filter.start;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime - state.filter.start;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return offset;
}

export function getCurrentSegment(state, o) {
  const offset = o === undefined ? currentOffset(state) : o;
  if (!state.segments || !offset) {
    return null;
  }

  const { segments } = state;

  for (let i = 0, len = segments.length; i < len; ++i) {
    const thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      break;
    }
    if (thisSegment.offset + thisSegment.duration > offset) {
      const segmentIndex = Math.floor((offset - thisSegment.offset) / SEGMENT_LENGTH);
      return {
        url: thisSegment.url,
        route: thisSegment.route,
        segment: segmentIndex,
        routeOffset: thisSegment.offset,
        startOffset: thisSegment.offset + segmentIndex * SEGMENT_LENGTH,
        routeFirstSegment: thisSegment.firstSegment,
        duration: thisSegment.duration,
        events: thisSegment.events,
        videoStartOffset: thisSegment.videoStartOffset,
        deviceType: thisSegment.deviceType,
        hpgps: thisSegment.hpgps,
        hasVideo: thisSegment.hasVideo,
        segments: thisSegment.segments,
        distanceMiles: thisSegment.distanceMiles,
        startLocation: thisSegment.startLocation,
        endLocation: thisSegment.endLocation,
        driveCoords: thisSegment.driveCoords,
      };
    }
  }
  return null;
}

function segmentsFromMetadata(segmentsData) {
  let curSegment = null;
  const segments = [];
  segmentsData.segments.forEach((segment) => {
    if (!segment.url) {
      return;
    }
    if (!(segment.proc_log === 40 || segment.proc_qlog === 40)) {
      return;
    }
    const segmentHasVideo = (segment.proc_camera >= 0);
    /*
      route: '99c94dc769b5d96e|2018-04-09--11-29-08',
      offset: 41348000,
      duration: 214000,
      segments: 4
    */
    if (!curSegment || curSegment.route !== segment.canonical_route_name) {
      let { url } = segment;
      const parts = url.split('/');

      if (Number.isFinite(Number(parts.pop()))) {
        // url has a number at the end
        url = parts.join('/');
      }
      curSegment = {
        offset: segment.offset - (segment.segment * SEGMENT_LENGTH),
        firstSegment: segment.segment,
        route: segment.canonical_route_name,
        startTime: segment.start_time_utc_millis,
        startCoord: [segment.start_lng, segment.start_lat],
        startLocation: null,
        endLocation: null,
        driveCoords: null,
        duration: 0,
        segments: 0,
        url: url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate.azureedge.net'),
        events: null,
        videoStartOffset: null,
        hasVideo: segmentHasVideo,
        deviceType: segment.devicetype,
        hpgps: segment.hpgps,
        locStart: '',
        locEnd: '',
        distanceMiles: 0.0,
      };
      segments.push(curSegment);
    }
    if (curSegment.startCoord[0] === 0 && curSegment.startCoord[1] === 0) {
      curSegment.startCoord = [segment.start_lng, segment.start_lat];
    }
    curSegment.hasVideo = (curSegment.hasVideo || segmentHasVideo);
    curSegment.hpgps = (curSegment.hpgps || segment.hpgps);
    curSegment.duration = (segment.offset - curSegment.offset) + segment.duration;
    curSegment.segments = Math.max(curSegment.segments, Number(segment.canonical_name.split('--').pop()) + 1);
    curSegment.distanceMiles += segment.length;
    if (!curSegment.endCoord || segment.end_lng !== 0 || segment.end_lat !== 0) {
      curSegment.endCoord = [segment.end_lng, segment.end_lat];
    }
  });

  return segments;
}

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_LOAD_SEGMENT_METADATA:
      state = {
        ...state,
        segmentData: {
          promise: action.promise,
          start: action.start,
          end: action.end,
          dongleId: state.dongleId
        }
      };
      break;
    case Types.ACTION_SEGMENT_METADATA:
      if (state.segments) {
        for (const segment of action.segments) {
          const oldSegment = state.segments.find((seg) => segment.route === seg.route && segment.segments === seg.segments);
          if (oldSegment) {
            segment.startLocation = oldSegment.startLocation;
            segment.endLocation = oldSegment.endLocation;
            segment.driveCoords = oldSegment.driveCoords;
            segment.events = oldSegment.events;
            segment.videoStartOffset = oldSegment.videoStartOffset;
          }
        }
      }
      state = {
        ...state,
        segmentData: action.data,
        segments: action.segments
      };
      break;
    case Types.ACTION_UPDATE_SEGMENTS:
      state = {
        ...state,
      }
      break;
    default:
      break;
  }

  state.currentSegment = getCurrentSegment(state);

  return state;
}

export function updateSegments() {
  return {
    type: Types.ACTION_UPDATE_SEGMENTS
  };
}

export function fetchSegmentMetadata(start, end, promise) {
  return {
    type: Types.ACTION_LOAD_SEGMENT_METADATA,
    start,
    end,
    promise
  };
}

export function insertSegmentMetadata(data) {
  return {
    type: Types.ACTION_SEGMENT_METADATA,
    segments: segmentsFromMetadata(data),
    data
  };
}

export function parseSegmentMetadata(state, _segments) {
  const routeStartTimes = {};
  const fetchRange = getSegmentFetchRange(state);
  let segments = _segments;
  segments = segments.map((_segment) => {
    const segment = _segment;
    segment.offset = Math.round(segment.start_time_utc_millis) - state.filter.start;
    const segmentNum = Number(segment.canonical_name.split('--')[2]);
    segment.segment = segmentNum;
    if (!routeStartTimes[segment.canonical_route_name]) {
      routeStartTimes[segment.canonical_route_name] = segment.offset - (SEGMENT_LENGTH * segmentNum);
    }
    segment.routeOffset = routeStartTimes[segment.canonical_route_name];

    segment.duration = Math.round(segment.end_time_utc_millis - segment.start_time_utc_millis);
    return segment;
  });

  return {
    start: fetchRange.start,
    dongleId: state.dongleId,
    end: fetchRange.end,
    segments
  };
}

export function hasSegmentMetadata(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (!state.segmentData) {
    console.log('No segment data at all');
    return false;
  }
  if (!state.segmentData.segments) {
    console.log('Still loading...');
    return false;
  }
  if (state.dongleId !== state.segmentData.dongleId) {
    console.log('Bad dongle id');
    return false;
  }
  const fetchRange = getSegmentFetchRange(state);
  if (fetchRange.start < state.segmentData.start) {
    console.log('Bad start offset');
    return false;
  }
  if (fetchRange.end > state.segmentData.end) {
    console.log('Bad end offset');
    return false;
  }

  return true;
}

export function getSegmentFetchRange(state) {
  if (!state.zoom && !(state.clips && state.clips.state === 'upload')) {
    return state.filter;
  }
  if (state.clips && state.clips.end_time < state.filter.start) {
    return {
      start: state.clips.start_time - 60000,
      end: state.clips.end_time + 60000,
    };
  }
  if (state.zoom && state.zoom.end < state.filter.start) {
    return {
      start: state.zoom.start - 14400000,
      end: state.zoom.end + 14400000,
    };
  }
  const mins = [state.filter.start];
  const maxs = [state.filter.end];
  if (state.clips && state.clips.state === 'upload') {
    mins.push(state.clips.start_time - 60000);
    maxs.push(state.clips.end_time + 60000);
  }
  if (state.zoom) {
    mins.push(state.zoom.start - 14400000);
    maxs.push(state.zoom.end + 14400000);
  }
  return {
    start: Math.min(...mins),
    end: Math.max(...maxs),
  };
}
