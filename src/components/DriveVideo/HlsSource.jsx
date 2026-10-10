import { useEffect } from 'react';
import Hls from 'hls.js';
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url';

import { setPlaybackRate } from '../../timeline/video';
import { mediaErrorKind } from '../../utils/media';

const HLS_CONFIG = { maxBufferLength: 40, workerPath: hlsWorkerUrl };

function hlsErrorKind(data) {
  if (data.response?.code === 404) return 'not-found';
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) return 'network';
  return 'media';
}

function bufferedEnd(video) {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index++) {
    const containsPlayhead = buffered.start(index) <= currentTime && currentTime <= buffered.end(index);
    if (containsPlayhead) return buffered.end(index);
  }
  return currentTime;
}

function subscribeErrors(hls, video, onError) {
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
    if (data.details === Hls.ErrorDetails.MEDIA_SOURCE_REQUIRES_RESET) return reportRepeatedReset({ kind, cause: data });
    const isMissingFragment = kind === 'not-found' && data.frag;
    if (!isMissingFragment) return;
    missingFragments.set(data.frag.sn, data.frag);
    reportMissingIfStalled();
  };
  const handleFragLoaded = (_, data) => missingFragments.delete(data.frag.sn);
  const handleSeeking = () => missingFragments.clear();
  const handleMediaError = () => recoverOrReport({ kind: mediaErrorKind(video.error), cause: video.error });

  hls.on(Hls.Events.ERROR, handleHlsError);
  hls.on(Hls.Events.FRAG_LOADED, handleFragLoaded);
  video.addEventListener('error', handleMediaError);
  video.addEventListener('waiting', reportMissingIfStalled);
  video.addEventListener('seeking', handleSeeking);
  return () => {
    hls.off(Hls.Events.ERROR, handleHlsError);
    hls.off(Hls.Events.FRAG_LOADED, handleFragLoaded);
    video.removeEventListener('error', handleMediaError);
    video.removeEventListener('waiting', reportMissingIfStalled);
    video.removeEventListener('seeking', handleSeeking);
  };
}

function subscribeAudio(hls, video, onHasAudioChange) {
  if (video.audioTracks) return () => {};
  const handleCodecs = (_, data) => onHasAudioChange?.(Boolean(data.audio));
  hls.once(Hls.Events.BUFFER_CODECS, handleCodecs);
  return () => hls.off(Hls.Events.BUFFER_CODECS, handleCodecs);
}

export default function HlsSource({ video, src, startPosition, onError, onHasAudioChange }) {
  useEffect(() => {
    setPlaybackRate(video, 1);
    const hls = new Hls({ ...HLS_CONFIG, startPosition });
    const unsubscribeErrors = subscribeErrors(hls, video, onError);
    const unsubscribeAudio = subscribeAudio(hls, video, onHasAudioChange);
    hls.loadSource(src);
    hls.attachMedia(video);
    video.currentTime = startPosition;
    return () => {
      unsubscribeErrors();
      unsubscribeAudio();
      hls.destroy();
    };
  }, [video, src, onError, onHasAudioChange]);

  return null;
}
