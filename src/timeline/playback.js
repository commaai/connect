import * as Types from '../actions/types';
import { readRouteOffsetMs, sendMediaCommand } from './media';
import { clampRouteOffsetToBounds, getEffectivePlayBounds } from './timing';

export function reducer(state, action) {
  switch (action.type) {
    case Types.ACTION_SEEK:
      if (!Number.isFinite(action.offset)) return state;
      return { ...state, offset: clampRouteOffsetToBounds(action.offset, getEffectivePlayBounds(state)),
        seekGeneration: (state.seekGeneration ?? 0) + 1 };
    case Types.ACTION_PAUSE:
      return { ...state, offset: action.offset ?? state.offset, playRequested: false };
    case Types.ACTION_PLAY:
      return { ...state, offset: action.offset ?? state.offset, playRequested: true,
        playSpeed: action.speed ?? state.playSpeed };
    case Types.ACTION_LOOP:
      return { ...state, loop: action.start != null && action.end > action.start
        ? { startTime: action.start, duration: action.end - action.start } : null };
    case Types.ACTION_RESET:
      return { ...state, offset: state.zoom?.start ?? 0, playRequested: true,
        isPaused: true, playSpeed: 1 };
    case Types.ACTION_PLAYBACK_MIRROR:
      if (action.fullname !== state.currentRoute?.fullname) return state;
      return { ...state, ...action.snapshot };
    default:
      return state;
  }
}

export function seek(offset) {
  return (dispatch, getState) => {
    if (!Number.isFinite(offset)) return;
    dispatch({ type: Types.ACTION_SEEK, offset });
    const state = getState();
    sendMediaCommand(state.currentRoute?.fullname, 'seek', state.offset);
  };
}
export function pause() {
  return (dispatch, getState) => {
    const state = getState();
    dispatch({ type: Types.ACTION_PAUSE, offset: readRouteOffsetMs(state) });
    sendMediaCommand(state.currentRoute?.fullname, 'pause');
  };
}
export function play(speed) {
  return (dispatch, getState) => {
    const state = getState();
    const rate = speed ?? state.playSpeed ?? 1;
    if (!Number.isFinite(rate) || rate < 0.1 || rate > 8) return;
    dispatch({ type: Types.ACTION_PLAY, speed: rate, offset: readRouteOffsetMs(state) });
    sendMediaCommand(state.currentRoute?.fullname, 'play', rate);
  };
}
export function selectLoop(start, end) { return { type: Types.ACTION_LOOP, start, end }; }
export function resetPlayback() { return { type: Types.ACTION_RESET }; }
export function mirrorPlayback(fullname, snapshot) {
  return { type: Types.ACTION_PLAYBACK_MIRROR, fullname, snapshot };
}
