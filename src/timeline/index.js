// The media element is the clock. Never advance the route while it is stalled,
// seeking, paused, or waiting for permission to play.
export function currentOffset(state) {
  return state.offset ?? state.loop?.startTime ?? state.zoom?.start ?? 0;
}
