// Playback controls. With a video attached (see ./player.js) they command the
// video, which then reports its own state back through DriveVideo. Without
// one, the offset is extrapolated from the last offset and the play speed.
import * as Types from '../actions/types';
import { currentOffset } from '.';
import { pausePlayer, playerOffset, playPlayer, seekPlayer } from './player';

export function reducer(_state, action) {
  let state = { ..._state };
  switch (action.type) {
    case Types.ACTION_SEEK:
      state = {
        ...state,
        offset: action.offset,
        startTime: Date.now(),
      };
      break;
    case Types.ACTION_PAUSE:
      state = {
        ...state,
        offset: action.offset,
        startTime: Date.now(),
        desiredPlaySpeed: 0,
      };
      break;
    case Types.ACTION_PLAY:
      state = {
        ...state,
        offset: action.offset,
        desiredPlaySpeed: action.speed,
        startTime: Date.now(),
      };
      break;
    case Types.ACTION_LOOP:
      if (action.start !== null && action.start !== undefined && action.end !== null && action.end !== undefined) {
        state.loop = {
          startTime: action.start,
          duration: action.end - action.start,
        };
      } else {
        state.loop = null;
      }
      break;
    case Types.ACTION_BUFFER_VIDEO:
      state = {
        ...state,
        isBufferingVideo: action.buffering,
        offset: currentOffset(state),
        startTime: Date.now(),
      };
      break;
    default:
      break;
  }

  // normalize over loop
  if (state.offset !== null && state.loop?.startTime) {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    const offset = state.offset + (Date.now() - state.startTime) * playSpeed;
    const loopOffset = state.loop.startTime;
    // has loop, trap offset within the loop
    if (offset < loopOffset) {
      state.startTime = Date.now();
      state.offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      state.offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
      state.startTime = Date.now();
    }
  }

  state.isBufferingVideo = Boolean(state.isBufferingVideo);

  return state;
}

// the video paused or played on its own, e.g. it ended or the OS paused it
export function videoPaused(offset) {
  return { type: Types.ACTION_PAUSE, offset };
}

export function videoPlaying(speed, offset) {
  return { type: Types.ACTION_PLAY, speed, offset };
}

// seek to a specific offset, within the loop
export function seek(offset) {
  return (dispatch, getState) => {
    const { loop } = getState();
    if (loop?.startTime != null) {
      offset = Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration);
    }
    seekPlayer(offset);
    dispatch({ type: Types.ACTION_SEEK, offset });
  };
}

const offsetNow = (getState) => playerOffset() ?? currentOffset(getState());

// pause the playback
export function pause() {
  return (dispatch, getState) => {
    pausePlayer();
    dispatch(videoPaused(offsetNow(getState)));
  };
}

// resume / change play speed
export function play(speed = 1) {
  return (dispatch, getState) => {
    dispatch(videoPlaying(speed, offsetNow(getState)));
    playPlayer(speed).catch((err) => {
      if (err.name === 'NotAllowedError') {
        // autoplay was blocked, wait for the user to press play
        dispatch(videoPaused(offsetNow(getState)));
      }
    });
  };
}

// play a range of the drive, from its start, on repeat
export function playRange(start, end) {
  return (dispatch) => {
    dispatch({ type: Types.ACTION_LOOP, start, end });
    dispatch(seek(start ?? 0));
    dispatch(play());
  };
}

// update video buffering state
export function bufferVideo(buffering) {
  return {
    type: Types.ACTION_BUFFER_VIDEO,
    buffering,
  };
}
