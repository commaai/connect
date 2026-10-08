export const videoSecondsForOffset = (route, offset) => Math.max(
  0,
  (offset - (route?.videoStartOffset || 0)) / 1000,
);

export const routeOffsetForVideoSeconds = (route, seconds) => Math.round(
  (seconds * 1000) + (route?.videoStartOffset || 0),
);
