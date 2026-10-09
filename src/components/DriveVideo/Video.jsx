import React, { useCallback, useEffect, useRef, useState } from 'react';
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url';

import { setPlaybackRate, setVideo } from '../../timeline/video';
import { useVideo, useVideoEvent } from '../../hooks/video';
import { playsHlsNatively } from '../../utils/browser.js';

const HLS_CONFIG = { maxBufferLength: 40, workerPath: hlsWorkerUrl };
const HLS_ERROR = 'hlsError';
const HLS_BUFFER_CODECS = 'hlsBufferCodecs';
const HLS_FRAG_LOADED = 'hlsFragLoaded';
const HLS_MEDIA_SOURCE_RESET = 'mediaSourceRequiresReset';

function hlsErrorKind(data) {
  if (data.response?.code === 404) return 'not-found';
  if (data.type === 'networkError') return 'network';
  return 'media';
}

function mediaErrorKind(error) {
  if (error.code === MediaError.MEDIA_ERR_NETWORK) return 'network';
  return 'media';
}

function useHls(video, src, startPosition, onError) {
  const [hls, setHls] = useState(null);
  const startPositionRef = useRef(startPosition);
  startPositionRef.current = startPosition;

  useEffect(() => {
    if (!video || !src) return undefined;
    setPlaybackRate(video, 1);

    if (playsHlsNatively()) {
      video.src = src;
      video.currentTime = startPosition;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    const controller = new AbortController();
    import('hls.js').then(({ default: Hls }) => {
      if (controller.signal.aborted) return;
      const instance = new Hls({ ...HLS_CONFIG, startPosition: startPositionRef.current });
      instance.loadSource(src);
      instance.attachMedia(video);
      video.currentTime = startPositionRef.current;
      controller.signal.addEventListener('abort', () => instance.destroy());
      setHls(instance);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      onError?.({ kind: 'network', cause: error });
    });

    return () => {
      controller.abort();
      setHls(null);
    };
  }, [video, src, onError]);

  return hls;
}

function bufferedEnd(video) {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index++) {
    const containsPlayhead = buffered.start(index) <= currentTime && currentTime <= buffered.end(index);
    if (containsPlayhead) return buffered.end(index);
  }
  return currentTime;
}

function useHlsErrors(hls, onError) {
  useEffect(() => {
    if (!hls) return undefined;

    const video = hls.media;
    const missingFragments = new Map();
    let hasTriedRecovery = false;
    const recover = (kind) => {
      if (kind === 'media') return hls.recoverMediaError();
      const hasPlaylist = hls.levels.length > 0;
      if (!hasPlaylist) return hls.loadSource(hls.url);
      hls.startLoad(video.currentTime);
    };
    const report = (error) => onError?.({ ...error, retry: () => recover(error.kind) });
    const recoverOrReport = (error) => {
      const canRecover = error.kind === 'media' && !hasTriedRecovery;
      if (!canRecover) return report(error);
      hasTriedRecovery = true;
      recover(error.kind);
    };
    const reportRepeatedReset = (error) => {
      if (hasTriedRecovery) return report(error);
      hasTriedRecovery = true;
    };

    const isMissingAtPlayhead = () => {
      const playableUntil = bufferedEnd(video);
      for (const fragment of missingFragments.values()) {
        const startsWhereBufferEnds = fragment.start <= playableUntil + hls.config.maxBufferHole;
        if (startsWhereBufferEnds && playableUntil < fragment.end) return true;
      }
      return false;
    };
    const reportMissingIfStalled = () => {
      const isStarved = video.readyState < video.HAVE_FUTURE_DATA;
      if (!isStarved || !isMissingAtPlayhead()) return;
      onError?.({ kind: 'not-found' });
    };

    const handleHlsError = (_, data) => {
      const kind = hlsErrorKind(data);
      if (data.fatal) return recoverOrReport({ kind, cause: data });
      if (data.details === HLS_MEDIA_SOURCE_RESET) return reportRepeatedReset({ kind, cause: data });
      const isMissingFragment = kind === 'not-found' && data.frag;
      if (!isMissingFragment) return;
      missingFragments.set(data.frag.sn, data.frag);
      reportMissingIfStalled();
    };
    const handleFragLoaded = (_, data) => missingFragments.delete(data.frag.sn);
    const handleSeeking = () => missingFragments.clear();
    const handleMediaError = () => recoverOrReport({ kind: mediaErrorKind(video.error), cause: video.error });

    hls.on(HLS_ERROR, handleHlsError);
    hls.on(HLS_FRAG_LOADED, handleFragLoaded);
    video.addEventListener('error', handleMediaError);
    video.addEventListener('waiting', reportMissingIfStalled);
    video.addEventListener('seeking', handleSeeking);
    return () => {
      hls.off(HLS_ERROR, handleHlsError);
      hls.off(HLS_FRAG_LOADED, handleFragLoaded);
      video.removeEventListener('error', handleMediaError);
      video.removeEventListener('waiting', reportMissingIfStalled);
      video.removeEventListener('seeking', handleSeeking);
    };
  }, [hls, onError]);
}

function useNativeVideoErrors(video, onError) {
  const handleError = useCallback(() => {
    if (!playsHlsNatively()) return;
    const position = video.currentTime;
    const retry = () => {
      video.load();
      video.currentTime = position;
    };
    onError?.({ kind: mediaErrorKind(video.error), cause: video.error, retry });
  }, [video, onError]);

  useVideoEvent('error', handleError);
}

function useAudioTrackDetection(video, onHasAudioChange) {
  useEffect(() => {
    const audioTracks = video?.audioTracks;
    if (!audioTracks) return undefined;

    const handleTrackAdded = () => {
      const isFirstTrack = audioTracks.length === 1;
      if (!isFirstTrack) return;
      onHasAudioChange?.(true);
    };

    const handleTrackRemoved = () => {
      const isTrackListEmpty = audioTracks.length === 0;
      if (!isTrackListEmpty) return;
      onHasAudioChange?.(false);
    };

    audioTracks.addEventListener('addtrack', handleTrackAdded);
    audioTracks.addEventListener('removetrack', handleTrackRemoved);
    return () => {
      audioTracks.removeEventListener('addtrack', handleTrackAdded);
      audioTracks.removeEventListener('removetrack', handleTrackRemoved);
    };
  }, [video, onHasAudioChange]);
}

function useHlsAudioDetection(hls, onHasAudioChange) {
  useEffect(() => {
    if (!hls) return undefined;

    const hasNativeAudioTracks = Boolean(hls.media?.audioTracks);
    if (hasNativeAudioTracks) return undefined;

    const handleCodecs = (_, data) => onHasAudioChange?.(Boolean(data.audio));

    hls.once(HLS_BUFFER_CODECS, handleCodecs);
    return () => hls.off(HLS_BUFFER_CODECS, handleCodecs);
  }, [hls, onHasAudioChange]);
}

export default function Video({ src, startPosition, onError, onHasAudioChange, ...props }) {
  const video = useVideo();
  const hls = useHls(video, src, startPosition, onError);
  useHlsErrors(hls, onError);
  useNativeVideoErrors(video, onError);
  useAudioTrackDetection(video, onHasAudioChange);
  useHlsAudioDetection(hls, onHasAudioChange);

  return (
    <video
      ref={setVideo}
      preload="auto"
      playsInline
      webkit-playsinline=""
      x5-playsinline=""
      {...props}
    />
  );
}
