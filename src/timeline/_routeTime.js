import { getVideo } from './_video';

export function toRouteMs(route, videoSeconds) {
  const videoStartOffset = route?.videoStartOffset || 0;
  return videoSeconds * 1000 + videoStartOffset;
}

export function getCurrentRouteMs(route) {
  const videoSeconds = getVideo()?.currentTime ?? 0;
  return toRouteMs(route, videoSeconds);
}

export function toVideoSeconds(route, routeMs) {
  const videoStartOffset = route?.videoStartOffset || 0;
  const videoMs = Math.max(0, routeMs - videoStartOffset);
  return videoMs / 1000;
}

export function clampToLoop(routeMs, loop) {
  if (!loop?.duration) {
    return routeMs;
  }
  const loopEnd = loop.startTime + loop.duration;
  return Math.min(Math.max(routeMs, loop.startTime), loopEnd);
}

export function seekToRouteMs(video, route, routeMs, loop) {
  const targetMs = clampToLoop(routeMs, loop);
  video.currentTime = toVideoSeconds(route, targetMs);
}
