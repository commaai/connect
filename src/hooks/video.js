import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { getVideo, subscribeVideo } from '../timeline/video';

const PAUSE_EVENTS = ['play', 'pause', 'emptied'];
const RATE_EVENTS = ['ratechange', 'emptied'];
const VOLUME_EVENTS = ['volumechange', 'emptied'];

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

export function useVideoPaused() {
  return useVideoValue(PAUSE_EVENTS, (video) => video.paused, true);
}

export function useVideoPlaybackRate() {
  return useVideoValue(RATE_EVENTS, (video) => video.playbackRate, 1);
}

export function useVideoMuted() {
  return useVideoValue(VOLUME_EVENTS, (video) => video.muted, true);
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
