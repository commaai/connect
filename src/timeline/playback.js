// basic helper functions for controlling playback
import * as Types from '../actions/types';

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK: {
      const loop = state.loop;
      const offset = loop?.duration > 0
        ? Math.max(loop.startTime, Math.min(action.offset, loop.startTime + loop.duration))
        : action.offset;
      state = { ...state, offset, seekRevision: (state.seekRevision || 0) + 1 };
      break;
    }
    case Types.ACTION_REPORT_VIDEO_TIME: {
      let { offset } = action;
      const loop = state.loop;
      if (loop?.duration > 0) {
        if (offset < loop.startTime) {
          offset = loop.startTime;
          if (state.offset !== loop.startTime) {
            state.seekRevision = (state.seekRevision || 0) + 1;
          }
        } else if (offset > loop.startTime + loop.duration) {
          offset = loop.startTime + ((offset - loop.startTime) % loop.duration);
          state.seekRevision = (state.seekRevision || 0) + 1;
        }
      }
      state.offset = offset;
      break;
    }
    case Types.ACTION_PAUSE:
      state.desiredPlaySpeed = 0;
      break;
    case Types.ACTION_PLAY:
      state.desiredPlaySpeed = action.speed;
      break;
    case Types.ACTION_LOOP:
      state.loop = action.start != null && action.end != null
        ? { startTime: action.start, duration: action.end - action.start }
        : null;
      if (state.loop?.duration > 0) {
        const end = state.loop.startTime + state.loop.duration;
        if (state.offset == null || state.offset < state.loop.startTime) {
          state.offset = state.loop.startTime;
          state.seekRevision = (state.seekRevision || 0) + 1;
        } else if (state.offset > end) {
          state.offset = end;
          state.seekRevision = (state.seekRevision || 0) + 1;
        }
      }
      break;
    case Types.ACTION_BUFFER_VIDEO:
      state.isBufferingVideo = action.buffering;
      break;
    case Types.ACTION_RESET:
      state = {
        ...state,
        desiredPlaySpeed: 1,
        isBufferingVideo: true,
        offset: 0,
        seekRevision: (state.seekRevision || 0) + 1,
      };
      break;
    default:
      break;
  }

  return { ...state, isBufferingVideo: Boolean(state.isBufferingVideo) };
}

export function seek(offset) {
  return { type: Types.ACTION_SEEK, offset };
}

export function reportVideoTime(offset) {
  return { type: Types.ACTION_REPORT_VIDEO_TIME, offset };
}

export function pause() {
  return { type: Types.ACTION_PAUSE };
}

export function play(speed = 1) {
  return { type: Types.ACTION_PLAY, speed };
}

export function selectLoop(start, end) {
  return { type: Types.ACTION_LOOP, start, end };
}

export function bufferVideo(buffering) {
  return { type: Types.ACTION_BUFFER_VIDEO, buffering };
}

export function resetPlayback() {
  return { type: Types.ACTION_RESET };
}
