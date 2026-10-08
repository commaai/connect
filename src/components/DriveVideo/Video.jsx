import React, { useCallback, useEffect, useState } from 'react';
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url';

import { setVideo } from '../../timeline/video';
import { useVideo, useVideoEvent } from '../../hooks/video';
import { playsHlsNatively } from '../../utils/browser.js';

const HLS_CONFIG = { maxBufferLength: 40, workerPath: hlsWorkerUrl };
const HLS_ERROR = 'hlsError';
const HLS_BUFFER_CODECS = 'hlsBufferCodecs';

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

  useEffect(() => {
    if (!video || !src) return undefined;

    if (playsHlsNatively()) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    const controller = new AbortController();
    import('hls.js').then(({ default: Hls }) => {
      if (controller.signal.aborted) return;
      const instance = new Hls({ ...HLS_CONFIG, startPosition });
      instance.loadSource(src);
      instance.attachMedia(video);
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

function useHlsErrors(hls, onError) {
  useEffect(() => {
    if (!hls) return undefined;

    const handleError = (_, data) => {
      const kind = hlsErrorKind(data);
      const isReportable = data.fatal || kind === 'not-found';
      if (!isReportable) return;
      onError?.({ kind, cause: data });
    };

    hls.on(HLS_ERROR, handleError);
    return () => hls.off(HLS_ERROR, handleError);
  }, [hls, onError]);
}

function useVideoErrors(video, onError) {
  const handleError = useCallback(() => {
    onError?.({ kind: mediaErrorKind(video.error), cause: video.error });
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
  useVideoErrors(video, onError);
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
