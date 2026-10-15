import { getVideo } from './video';

const SEEK_PRECISION_MS = 1;

export function toRouteMs(videoStartOffset, videoSeconds) {
  return videoSeconds * 1000 + (videoStartOffset ?? 0);
}

export function getCurrentRouteMs(videoStartOffset) {
  const videoSeconds = getVideo()?.currentTime ?? 0;
  return toRouteMs(videoStartOffset, videoSeconds);
}

export function toVideoSeconds(videoStartOffset, routeMs) {
  const videoMs = Math.max(0, routeMs - (videoStartOffset ?? 0));
  return videoMs / 1000;
}

export function clampToLoop(routeMs, loop) {
  if (!loop?.duration) return routeMs;
  const loopEnd = loop.startTime + loop.duration;
  return Math.min(Math.max(routeMs, loop.startTime), loopEnd);
}

export function toClampedTimestamp(routeMs, loopStart, loopEnd, isPaused) {
  if (routeMs < loopStart - SEEK_PRECISION_MS) return loopStart;
  if (routeMs < loopEnd) return null;
  if (!isPaused) return loopStart;
  if (routeMs <= loopEnd + SEEK_PRECISION_MS) return null;
  return loopEnd;
}
