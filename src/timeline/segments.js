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

function currentOffset(state) {
  let playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
  let offset = state.offset + ((Date.now() - state.startTime) * playSpeed);

  if (state.loop && state.loop.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime - state.filter.start;
    if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }

  return offset;
}

export function getCurrentSegment(state, o) {
  const offset = o === undefined ? currentOffset(state) : o;
  if (!state.segments) {
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
        deviceType: thisSegment.deviceType,
        videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
        hpgps: thisSegment.hpgps,
        hasVideo: thisSegment.hasVideo,
        cameraStreamSegCount: thisSegment.cameraStreamSegCount,
        distanceMiles: thisSegment.distanceMiles,
      };
    }
  }
  return null;
}

function finishSegment(segment) {
  let lastEngage = null;

  if (segment.hasVideo) {
    const vidAvail = segment.videoAvailableBetweenOffsets;
    let lastVideoRange = vidAvail[vidAvail.length - 1];
    if (!lastVideoRange) {
      lastVideoRange = [segment.offset, segment.offset + segment.duration];
    }
    segment.videoAvailableBetweenOffsets = [ // eslint-disable-line no-param-reassign
      ...vidAvail.slice(0, vidAvail.length - 1),
      [lastVideoRange[0], segment.offset + segment.duration]
    ];
  }
  segment.events = segment.events.sort((a, b) => { // eslint-disable-line no-param-reassign
    if (a.route_offset_millis === b.route_offset_millis) {
      return a.route_offset_nanos - b.route_offset_nanos;
    }
    return a.route_offset_millis - b.route_offset_millis;
  });
  segment.events.forEach((event) => {
    // NOTE sometimes theres 2 disengages in a row and that is NONSENSE
    switch (event.type) {
      case 'engage':
        lastEngage = event;
        break;
      case 'disengage':
        if (lastEngage) {
          lastEngage.data = {
            end_offset_nanos: event.offset_nanos,
            end_offset_millis: event.offset_millis,
            end_route_offset_nanos: event.route_offset_nanos,
            end_route_offset_millis: event.route_offset_millis
          };
        }
        break;
      default:
        break;
    }
  });
}

function segmentsFromMetadata(segmentsData) {
  let curSegment = null;
  let curVideoStartOffset = null;
  const segments = [];
  segmentsData.segments.forEach((segment) => {
    if (!segment.url) {
      return;
    }
    if (!(segment.proc_log === 40 || segment.proc_qlog === 40)) {
      return;
    }
    const segmentHasVideo = (segment.proc_camera >= 0);
    if (segmentHasVideo && curVideoStartOffset === null) {
      curVideoStartOffset = segment.offset;
    }
    /*
      route: '99c94dc769b5d96e|2018-04-09--11-29-08',
      offset: 41348000,
      duration: 214000,
      segments: 4
    */
    if (!curSegment || curSegment.route !== segment.canonical_route_name) {
      if (curSegment) {
        finishSegment(curSegment);
      }
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
        duration: 0,
        segments: 0,
        url: url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate-vzn.azureedge.net'),
        events: [],
        videoAvailableBetweenOffsets: [],
        hasVideo: segmentHasVideo,
        deviceType: segment.devicetype,
        hpgps: segment.hpgps,
        locStart: '',
        locEnd: '',
        distanceMiles: 0.0,
        cameraStreamSegCount: 0,
      };
      segments.push(curSegment);
    }
    if (curSegment.startCoord[0] === 0 && curSegment.startCoord[1] === 0) {
      curSegment.startCoord = [segment.start_lng, segment.start_lat];
    }
    if (!segmentHasVideo && curVideoStartOffset !== null) {
      curSegment.videoAvailableBetweenOffsets.push([curVideoStartOffset, segment.offset]);
      curVideoStartOffset = null;
    }
    curSegment.hasVideo = (curSegment.hasVideo || segmentHasVideo);
    curSegment.hpgps = (curSegment.hpgps || segment.hpgps);
    curSegment.duration = (segment.offset - curSegment.offset) + segment.duration;
    curSegment.segments = Math.max(curSegment.segments, Number(segment.canonical_name.split('--').pop()) + 1);
    curSegment.events = curSegment.events.concat(segment.events);
    curSegment.distanceMiles += segment.length;
    curSegment.cameraStreamSegCount += Math.floor(segmentHasVideo);
    if (!curSegment.endCoord || segment.end_lng !== 0 || segment.end_lat !== 0) {
      curSegment.endCoord = [segment.end_lng, segment.end_lat];
    }
  });

  if (curSegment) {
    finishSegment(curSegment);
  }

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
    if (!routeStartTimes[segment.canonical_route_name]) {
      const segmentNum = Number(segment.canonical_name.split('--')[2]);
      segment.segment = segmentNum;
      routeStartTimes[segment.canonical_route_name] = segment.offset;
      if (segmentNum > 0) {
        routeStartTimes[segment.canonical_route_name] -= (SEGMENT_LENGTH * segmentNum);
      }
    }
    segment.routeOffset = routeStartTimes[segment.canonical_route_name];

    segment.duration = Math.round(segment.end_time_utc_millis - segment.start_time_utc_millis);
    segment.events = JSON.parse(segment.events_json) || [];
    const plannedDisengageEvents = segment.events.filter(
      (event) => event.type === 'alert' && event.data && event.data.should_take_control
    );

    segment.events.forEach((_event) => {
      const event = _event;
      event.timestamp = segment.start_time_utc_millis + event.offset_millis;
      event.canonical_segment_name = segment.canonical_name;

      if (event.data && event.data.is_planned) {
        let reason;

        const alert = plannedDisengageEvents.reduce((closestAlert, nextAlert) => {
          const closestAlertDiff = Math.abs(closestAlert.offset_millis - event.offset_millis);
          if (Math.abs(nextAlert.offset_millis - event.offset_millis) < closestAlertDiff) {
            return nextAlert;
          }
          return closestAlert;
        }, plannedDisengageEvents[0]);
        if (alert) {
          reason = alert.data.alertText2;
        } else {
          console.warn('Expected alert corresponding to planned disengagement', event);
          reason = 'Planned disengagement';
        }

        event.id = `planned_disengage_${event.time}`;
      }
    });
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
  if (!state.zoom || !state.zoom.expanded) {
    return state.filter;
  }
  if (state.zoom.end < state.filter.start) {
    return {
      start: state.zoom.start - 60000,
      end: state.zoom.end + 60000,
    };
  }
  return {
    start: Math.min(state.filter.start, state.zoom.start - 60000),
    end: Math.max(state.filter.end, state.zoom.end + 60000),
  };
}
