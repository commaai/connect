import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { getVideo, subscribeVideo } from '../timeline/video';

const CONTROL_EVENTS = ['play', 'pause', 'ratechange', 'volumechange', 'emptied'];

const STATUS_EVENTS = [
  'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'waiting', 'playing', 'seeking', 'seeked', 'emptied', 'error',
];

function isBuffering(video) {
  const hasSource = video.networkState !== video.NETWORK_EMPTY;
  const canPlayAhead = video.readyState >= video.HAVE_FUTURE_DATA;
  return hasSource && !canPlayAhead;
}

export const useVideo = () => useSyncExternalStore(subscribeVideo, getVideo);

export function useVideoValue(events, read, fallback) {
  const video = useVideo();

  const subscribe = useCallback((onChange) => {
    if (!video) {
      return () => {};
    }
    for (const type of events) {
      video.addEventListener(type, onChange);
    }
    return () => {
      for (const type of events) {
        video.removeEventListener(type, onChange);
      }
    };
  }, [video, events]);

  const getSnapshot = () => {
    if (!video) {
      return fallback;
    }
    return read(video);
  };

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useVideoControls() {
  const paused = useVideoValue(CONTROL_EVENTS, (video) => video.paused, true);
  const playbackRate = useVideoValue(CONTROL_EVENTS, (video) => video.playbackRate, 1);
  const muted = useVideoValue(CONTROL_EVENTS, (video) => video.muted, true);
  return useMemo(() => ({ paused, playbackRate, muted }), [paused, playbackRate, muted]);
}

export function useVideoStatus() {
  const buffering = useVideoValue(STATUS_EVENTS, isBuffering, false);
  const seeking = useVideoValue(STATUS_EVENTS, (video) => video.seeking, false);
  return useMemo(() => ({ buffering, seeking }), [buffering, seeking]);
}

export function useVideoEvent(type, handler) {
  const video = useVideo();

  useEffect(() => {
    if (!video) {
      return undefined;
    }
    video.addEventListener(type, handler);
    return () => video.removeEventListener(type, handler);
  }, [video, type, handler]);
}

export function useVideoFrame(callback) {
  const video = useVideo();

  useEffect(() => {
    if (!video) {
      return undefined;
    }
    let frame;
    const tick = () => {
      callback(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [video, callback]);
}
