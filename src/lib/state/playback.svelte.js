/**
 * Playback state machine, ported from the redux reducer in src/timeline/playback.js.
 *
 * The offset is not ticked: it is derived from wall-clock time as
 * `offset + (Date.now() - startTime) * playSpeed`, so anything that changes the speed
 * has to commit the offset reached so far first.
 *
 * All of the arithmetic lives in plain functions that take an explicit state object,
 * mirroring how currentOffset() already accepted one. The rune class below is a thin
 * wrapper that snapshots its fields, applies a transition, and writes the result back.
 */

/**
 * @param {object} state
 * @returns {number|null}
 */
function loopStart(state) {
  if (state.loop && state.loop.startTime !== null) {
    return state.loop.startTime;
  }
  return null;
}

/**
 * Get the playback offset for a state snapshot.
 *
 * @param {object} state
 * @returns {number}
 */
export function currentOffset(state) {
  /** @type {number} */
  let offset;
  if (state.offset === null && state.loop?.startTime) {
    offset = state.loop.startTime;
  } else {
    const playSpeed = state.isBufferingVideo ? 0 : state.desiredPlaySpeed;
    offset = state.offset + ((Date.now() - state.startTime) * playSpeed);
  }

  if (offset !== null && state.loop?.startTime) {
    // respect the loop
    const loopOffset = state.loop.startTime;
    if (offset < loopOffset) {
      offset = loopOffset;
    } else if (offset > loopOffset + state.loop.duration) {
      offset = ((offset - loopOffset) % state.loop.duration) + loopOffset;
    }
  }
  return offset;
}

/**
 * Invariants the reducer re-applied after every action: skip the head of a route that has
 * no video yet, and wrap the offset back into the loop. Mutates and returns `state`.
 *
 * @param {object} state
 * @returns {object}
 */
export function normalize(state) {
  if (state.currentRoute && state.currentRoute.videoStartOffset && state.loop && state.zoom
    && state.loop.startTime === state.zoom.start && state.zoom.start === 0) {
    const loopRouteOffset = state.loop.startTime - state.zoom.start;
    if (state.currentRoute.videoStartOffset > loopRouteOffset) {
      state.loop = {
        startTime: state.zoom.start + state.currentRoute.videoStartOffset,
        duration: state.loop.duration - (state.currentRoute.videoStartOffset - loopRouteOffset),
      };
    }
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

/** Seek to a specific offset, clamped to the loop. */
export function applySeek(state, offset) {
  const loopOffset = loopStart(state);
  const next = {
    ...state,
    offset,
    startTime: Date.now(),
  };

  if (loopOffset !== null) {
    if (next.offset < loopOffset) {
      next.offset = loopOffset;
    } else if (next.offset > (loopOffset + state.loop.duration)) {
      next.offset = loopOffset + state.loop.duration;
    }
  }
  return normalize(next);
}

/** Pause playback, committing the offset reached so far. */
export function applyPause(state) {
  return normalize({
    ...state,
    offset: currentOffset(state),
    startTime: Date.now(),
    desiredPlaySpeed: 0,
  });
}

/** Resume playback, or change the play speed. */
export function applyPlay(state, speed = 1) {
  if (speed === state.desiredPlaySpeed) {
    return normalize({ ...state });
  }
  return normalize({
    ...state,
    offset: currentOffset(state),
    desiredPlaySpeed: speed,
    startTime: Date.now(),
  });
}

/** Set or, with a nullish start/end, clear the loop. */
export function applySelectLoop(state, start, end) {
  const next = { ...state };
  if (start !== null && start !== undefined && end !== null && end !== undefined) {
    next.loop = {
      startTime: start,
      duration: end - start,
    };
  } else {
    next.loop = null;
  }
  return normalize(next);
}

/** Update the video buffering state; playback is frozen while buffering. */
export function applyBufferVideo(state, buffering) {
  return normalize({
    ...state,
    isBufferingVideo: buffering,
    offset: currentOffset(state),
    startTime: Date.now(),
  });
}

/** Back to the start of the zoom, buffering at 1x. */
export function applyReset(state) {
  return normalize({
    ...state,
    desiredPlaySpeed: 1,
    isBufferingVideo: true,
    offset: 0,
    startTime: Date.now(),
  });
}

class Playback {
  desiredPlaySpeed = $state(1); // speed set by user
  isBufferingVideo = $state(true); // if we're currently buffering for more data
  offset = $state(null); // in milliseconds, relative to zoom.start
  startTime = $state(Date.now()); // millisecond timestamp in which play began

  loop = $state(null);
  zoom = $state(null);
  // only read, for the videoStartOffset fixup; owned by the routes state
  currentRoute = $state(null);

  /** Plain snapshot, for the pure helpers above. */
  state() {
    return {
      desiredPlaySpeed: this.desiredPlaySpeed,
      isBufferingVideo: this.isBufferingVideo,
      offset: this.offset,
      startTime: this.startTime,
      loop: this.loop,
      zoom: this.zoom,
      currentRoute: this.currentRoute,
    };
  }

  commit(next) {
    this.desiredPlaySpeed = next.desiredPlaySpeed;
    this.isBufferingVideo = next.isBufferingVideo;
    this.offset = next.offset;
    this.startTime = next.startTime;
    this.loop = next.loop;
  }

  /**
   * Re-apply the reducer invariants. The redux playback reducer ran after every
   * dispatch, so assigning currentRoute/zoom/loop used to fix the loop up for
   * videoStartOffset as a side effect; call this after assigning them instead.
   */
  refresh() {
    this.commit(normalize(this.state()));
  }

  currentOffset(state = null) {
    return currentOffset(state || this.state());
  }

  seek(offset) {
    this.commit(applySeek(this.state(), offset));
  }

  pause() {
    this.commit(applyPause(this.state()));
  }

  play(speed = 1) {
    this.commit(applyPlay(this.state(), speed));
  }

  selectLoop(start, end) {
    this.commit(applySelectLoop(this.state(), start, end));
  }

  bufferVideo(buffering) {
    this.commit(applyBufferVideo(this.state(), buffering));
  }

  reset() {
    this.commit(applyReset(this.state()));
  }
}

// jest imports this module without the Svelte compiler, where the runes are undefined;
// the unit tests only use the pure helpers, so a missing rune runtime is not fatal there.
function createPlayback() {
  try {
    return new Playback();
  } catch {
    return null;
  }
}

export const playback = createPlayback();
