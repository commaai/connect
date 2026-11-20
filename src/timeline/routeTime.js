import { getDriveVideo } from './video';

const SEEK_PRECISION_MS = 1;

export function videoSecondsToRouteMs(videoStartOffset, videoSeconds) {
  return videoSeconds * 1000 + (videoStartOffset ?? 0);
}

export function getPlayheadRouteMs(videoStartOffset) {
  const videoSeconds = getDriveVideo()?.currentTime ?? 0;
  return videoSecondsToRouteMs(videoStartOffset, videoSeconds);
}

export function routeMsToVideoSeconds(videoStartOffset, routeMs) {
  const videoMs = Math.max(0, routeMs - (videoStartOffset ?? 0));
  return videoMs / 1000;
}

export function clampRouteMsToLoop(routeMs, loop) {
  if (!loop?.duration) return routeMs;
  const loopEnd = loop.startTime + loop.duration;
  return Math.min(Math.max(routeMs, loop.startTime), loopEnd);
}

export function findLoopSeekTarget(routeMs, loopStart, loopEnd, isPaused) {
  if (routeMs < loopStart - SEEK_PRECISION_MS) return loopStart;
  if (routeMs < loopEnd) return null;
  if (!isPaused) return loopStart;
  if (routeMs <= loopEnd + SEEK_PRECISION_MS) return null;
  return loopEnd;
}
