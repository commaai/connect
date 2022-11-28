import { createAction, createReducer } from '@reduxjs/toolkit';

// basic helper functions for controlling playback
// we shouldn't want to edit the raw state most of the time, helper functions are better
import { getZoom } from '../../../url';
import store from '../../index';

// fetch current playback offset, relative to `state.filter.start`
export function currentOffset(state = null) {
  if (!state) {
    state = store.getState();
  }

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

function normalise(state) {
  if (state?.currentRoute?.videoStartOffset && state.loop && state.zoom && state.filter
    && state.loop.startTime === state.zoom.start && state.filter.start + state.currentRoute.offset === state.zoom.start) {
    const loopRouteOffset = state.loop.startTime - state.zoom.start;
    if (state.currentRoute.videoStartOffset > loopRouteOffset) {
      state.loop.startTime = state.zoom.start + state.currentRoute.videoStartOffset;
      state.loop.duration = state.loop.duration - (state.currentRoute.videoStartOffset - loopRouteOffset);
    }
  }

  // normalize over loop
  if (state.offset !== null && state.loop?.startTime) {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    const offset = state.offset + (Date.now() - state.startTime) * playSpeed;
    const loopOffset = state.loop.startTime - state.filter.start;
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
}

function getDefaultLoop(pathname) {
  // in time instead of offset
  // this makes it so that the timespan can change without this changing
  // that's helpful to shared links and other things probably...
  const zoom = getZoom(pathname);
  if (zoom) {
    return {
      startTime: zoom.start,
      duration: zoom.end - zoom.start,
    };
  }
  return null;
}

const initialState = {
  desiredPlaySpeed: 1, // speed set by user
  isBufferingVideo: true, // if we're currently buffering for more data
  offset: null, // in miliseconds, relative to `state.filter.start`
  startTime: Date.now(), // millisecond timestamp in which play began

  zoom: getZoom(window.location.pathname),
  loop: getDefaultLoop(window.location.pathname),
};

export const playbackReducer = createReducer(initialState, (builder) => {
  builder
    .addCase('playback/seek', (state, action) => {
      state.offset = action.offset;
      state.startTime = Date.now();

      if (state.loop) {
        const { startTime, duration } = state.loop;
        if (state.offset < startTime) {
          state.offset = startTime;
        } else if (state.offset > (startTime + duration)) {
          state.offset = startTime + duration;
        }
      }

      normalise(state);
    })
    .addCase('playback/pause', (state) => {
      state.offset = currentOffset(state);
      state.startTime = Date.now();
      state.desiredPlaySpeed = 0;

      normalise(state);
    })
    .addCase('playback/play', (state, action) => {
      if (action.speed !== state.desiredPlaySpeed) {
        state.offset = currentOffset(state);
        state.desiredPlaySpeed = action.speed;
        state.startTime = Date.now();
      }

      normalise(state);
    })
    .addCase('playback/loop', (state, action) => {
      if (action.start && action.end) {
        state.loop = {
          startTime: action.start,
          duration: action.end - action.start,
        };
      } else {
        state.loop = null;
      }

      normalise(state);
    })
    .addCase('playback/buffering', (state, action) => {
      state.isBufferingVideo = action.buffering;
      state.offset = currentOffset(state);
      state.startTime = Date.now();

      normalise(state);
    })
    .addCase('playback/reset', (state) => {
      state.desiredPlaySpeed = 1;
      state.isBufferingVideo = true;
      state.offset = 0;
      state.startTime = Date.now();

      normalise(state);
    });
});

// seek to a specific offset
export const seek = createAction('playback/seek', (offset) => ({
  payload: {
    offset,
  },
}));

// pause the playback
export const pause = createAction('playback/pause');

// resume / change play speed
export const play = createAction('playback/play', (speed = 1) => ({
  payload: {
    speed,
  },
}));

export const selectLoop = createAction('playback/loop', (start, end) => ({
  payload: {
    start,
    end,
  },
}));

// update buffering state
export const setBuffering = createAction('playback/buffering', (buffering) => ({
  payload: {
    buffering,
  },
}));

export const resetPlayback = createAction('playback/reset');
