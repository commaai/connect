import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { getVideo, subscribeVideo } from '../timeline/video';

const CONTROL_EVENTS = ['play', 'pause', 'ratechange', 'volumechange', 'emptied'];

const TIME_EVENTS = ['loadstart', 'loadedmetadata', 'timeupdate', 'seeking', 'emptied'];

const STATUS_EVENTS = [
  'loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'waiting', 'playing', 'play', 'pause', 'seeking', 'seeked', 'emptied', 'error',
];

function isBuffering(video) {
  const hasSource = video.networkState !== video.NETWORK_EMPTY;
  const canPlayAhead = video.readyState >= video.HAVE_FUTURE_DATA;
  const isPausedWithMetadata = video.paused && video.readyState >= video.HAVE_METADATA;
  return hasSource && !canPlayAhead && !isPausedWithMetadata;
}

export const useVideo = () => useSyncExternalStore(subscribeVideo, getVideo);

function useVideoValue(events, read, fallback) {
  const video = useVideo();

  const subscribe = useCallback((onChange) => {
    if (!video) return () => {};
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
    if (!video) return fallback;
    return read(video);
  };

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useVideoTime(format, fallback) {
  return useVideoValue(TIME_EVENTS, (video) => format(video.currentTime), fallback);
}

export function useVideoControls() {
  const paused = useVideoValue(CONTROL_EVENTS, (video) => video.paused, true);
  const playbackRate = useVideoValue(CONTROL_EVENTS, (video) => video.playbackRate, 1);
  const muted = useVideoValue(CONTROL_EVENTS, (video) => video.muted, true);
  return useMemo(() => ({ paused, playbackRate, muted }), [paused, playbackRate, muted]);
}

export function useVideoBuffering() {
  return useVideoValue(STATUS_EVENTS, isBuffering, false);
}

export function useVideoEvent(type, handler) {
  const video = useVideo();

  useEffect(() => {
    if (!video) return undefined;
    video.addEventListener(type, handler);
    return () => video.removeEventListener(type, handler);
  }, [video, type, handler]);
}

export function useVideoFrame(callback) {
  const video = useVideo();

  useEffect(() => {
    if (!video) return undefined;
    let frame;
    const tick = () => {
      callback(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [video, callback]);
}
