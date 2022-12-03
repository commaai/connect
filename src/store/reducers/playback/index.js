import { createAction, createReducer } from '@reduxjs/toolkit';

import { getZoom } from '../../../url';

/**
 * fetch current playback offset, relative to `state.filter.start`
 */
export const currentOffset = (state) => {
  let offset;
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
};

const getDefaultLoop = (pathname) => {
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
};

const initialState = {
  desiredPlaySpeed: 1, // speed set by user
  isBufferingVideo: true, // if we're currently buffering for more data
  offset: null, // in milliseconds, relative to `state.filter.start`
  startTime: Date.now(), // millisecond timestamp in which play began

  zoom: getZoom(window.location.pathname),
  loop: getDefaultLoop(window.location.pathname),
};

// seek to a specific offset
export const seek = createAction('playback/seek', (offset) => ({
  payload: {
    offset,
  },
}));

// pause playback
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

// TODO: simplify this
const normalise = (state) => {
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

  // FIXME: is this still needed?
  state.isBufferingVideo = Boolean(state.isBufferingVideo);
};

const getLoopOffset = (state) => {
  if (state.loop && state.loop.startTime !== null) {
    return state.loop.startTime - state.filter.start;
  }
  return null;
};

export const playbackReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(seek, (state, action) => {
      let { offset } = action.payload;

      const loopOffset = getLoopOffset(state);
      if (loopOffset !== null) {
        const { duration } = state.loop;
        if (offset < loopOffset) {
          offset = loopOffset;
        } else if (offset > (loopOffset + duration)) {
          offset = loopOffset + duration;
        }
      }

      state.startTime = Date.now();
      state.offset = offset;
      normalise(state);
    })
    .addCase(pause, (state) => {
      state.offset = currentOffset(state);
      state.startTime = Date.now();
      state.desiredPlaySpeed = 0;
      normalise(state);
    })
    .addCase(play, (state, action) => {
      const { speed } = action.payload;
      if (speed === state.desiredPlaySpeed) return;

      state.offset = currentOffset(state);
      state.startTime = Date.now();
      state.desiredPlaySpeed = speed;
      normalise(state);
    })
    .addCase(selectLoop, (state, action) => {
      const { start, end } = action.payload;
      if (start && end) {
        state.loop = {
          startTime: start,
          duration: end - start,
        };
      } else {
        state.loop = null;
      }
      normalise(state);
    })
    .addCase(setBuffering, (state, action) => {
      const { buffering } = action.payload;
      state.isBufferingVideo = buffering;
      state.offset = currentOffset(state);
      state.startTime = Date.now();
      normalise(state);
    })
    .addCase(resetPlayback, (state) => {
      state.startTime = Date.now();
      state.desiredPlaySpeed = 1;
      state.isBufferingVideo = true;
      state.offset = 0;
      normalise(state);
    });
});
