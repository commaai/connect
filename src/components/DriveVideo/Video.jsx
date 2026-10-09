import React, { Suspense, lazy, useCallback, useEffect } from 'react';

import { setPlaybackRate, setVideo } from '../../timeline/video';
import { useVideo, useVideoEvent } from '../../hooks/video';
import { playsHlsNatively } from '../../utils/browser.js';
import { mediaErrorKind } from '../../utils/media';

function HlsUnavailable({ onError }) {
  useEffect(() => {
    onError?.({ kind: 'network' });
  }, [onError]);
  return null;
}

const HlsSource = lazy(() => import('./HlsSource').catch(() => ({ default: HlsUnavailable })));

function useNativeSource(video, src, startPosition) {
  useEffect(() => {
    if (!video || !src) return undefined;
    setPlaybackRate(video, 1);
    video.src = src;
    video.currentTime = startPosition;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [video, src]);
}

function useNativeVideoErrors(video, onError) {
  const handleError = useCallback(() => {
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

function NativeSource({ video, src, startPosition, onError }) {
  useNativeSource(video, src, startPosition);
  useNativeVideoErrors(video, onError);
  return null;
}

function Source({ video, ...props }) {
  if (!video || !props.src) return null;
  if (playsHlsNatively()) return <NativeSource video={video} {...props} />;
  return (
    <Suspense fallback={null}>
      <HlsSource video={video} {...props} />
    </Suspense>
  );
}

export default function Video({ src, startPosition, onError, onHasAudioChange, ...props }) {
  const video = useVideo();
  useAudioTrackDetection(video, onHasAudioChange);

  return (
    <>
      <video
        ref={setVideo}
        preload="auto"
        playsInline
        webkit-playsinline=""
        x5-playsinline=""
        {...props}
      />
      <Source video={video} src={src} startPosition={startPosition} onError={onError} onHasAudioChange={onHasAudioChange} />
    </>
  );
}
