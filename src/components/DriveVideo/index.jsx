import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, setVideo } from '../../timeline';
import { pause, play, restoreOffset, seek, videoStateChanged } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

// iOS plays HLS natively, and iPhones have no MediaSource for hls.js anyway.
// Everywhere else hls.js gives us clear errors and tells us if there is audio.
const playsHlsNatively = (video) => (isIos() || !window.MediaSource)
  && video.canPlayType('application/vnd.apple.mpegurl') !== '';

const NOT_FOUND = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video';

// waiting for data: loading, seeking, or playing past what has downloaded
function isBuffering(video) {
  return video.seeking || video.readyState < (video.paused ? HTMLMediaElement.HAVE_METADATA : HTMLMediaElement.HAVE_FUTURE_DATA);
}

// the spinner fades in after a short delay so quick seeks don't flash it
const VideoOverlay = ({ loading, error, onRetry }) => (
  <div
    className={`z-50 absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center bg-[#16181AAA] transition-opacity ${
      error || loading ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${error ? '' : 'delay-300'}`}
  >
    {error ? (
      <>
        <ErrorOutline />
        <Typography>{error}</Typography>
        <Button variant="outlined" size="small" onClick={onRetry}>Retry</Button>
      </>
    ) : (
      <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
    )}
  </div>
);

function DriveVideo({ dispatch, currentRoute, loop, isMuted, onAudioStatusChange }) {
  const videoRef = useRef(null);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const src = currentRoute && api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

  useEffect(() => {
    setVideo(videoRef.current);
    return () => setVideo(null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!src) {
      return undefined;
    }
    setError(null);

    if (playsHlsNatively(video)) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    let hls = null;
    let cancelled = false;
    import('hls.js/light').then(({ default: Hls }) => {
      if (cancelled) {
        return;
      }
      let recovered = false;
      hls = new Hls({
        maxBufferLength: 40,
        workerPath: hlsWorkerUrl,
        startPosition: Math.max(0, currentOffset() - (currentRoute.videoStartOffset || 0)) / 1000,
      });
      hls.on(Hls.Events.BUFFER_CODECS, (_, data) => onAudioStatusChange?.(Boolean(data.audio)));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true;
          dispatch(seek(currentOffset())); // so the reattached video resumes here
          hls.recoverMediaError();
        } else if (data.response?.code === 404) {
          setError(NOT_FOUND);
        } else {
          setError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? NETWORK_ERROR : LOAD_ERROR);
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    }).catch(() => setError(NETWORK_ERROR));

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src, attempt]);

  // reload from where we are now
  const retry = () => {
    dispatch(seek(currentOffset()));
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    if (!error) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [error]);

  const updateBuffering = (ev) => setBuffering(isBuffering(ev.currentTarget));

  const updatePlayState = (ev) => {
    dispatch(videoStateChanged(ev.currentTarget));
    updateBuffering(ev);
  };

  const onLoadedMetadata = (ev) => {
    dispatch(restoreOffset());
    if (playsHlsNatively(ev.currentTarget)) {
      onAudioStatusChange?.(ev.currentTarget.audioTracks?.length > 0);
    }
    updateBuffering(ev);
  };

  // play the selection on repeat
  const onTimeUpdate = (ev) => {
    if (loop && !ev.currentTarget.paused && currentOffset() >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }
  };

  const onEnded = () => {
    dispatch(seek(loop?.startTime ?? 0));
    dispatch(play());
  };

  // hls.js reports (and recovers from) its own errors
  const onError = (ev) => {
    const { error: mediaError } = ev.currentTarget;
    if (mediaError && playsHlsNatively(ev.currentTarget)) {
      setError(mediaError.code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR);
    }
  };

  return (
    <div className="w-full min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={buffering} error={error} onRetry={retry} />
      <video
        ref={videoRef}
        className="w-full h-full"
        autoPlay
        playsInline
        muted={isMuted}
        preload="auto"
        onClick={(ev) => dispatch(ev.currentTarget.paused ? play() : pause())}
        onLoadStart={updateBuffering}
        onLoadedMetadata={onLoadedMetadata}
        onCanPlay={updateBuffering}
        onWaiting={updateBuffering}
        onPlaying={updateBuffering}
        onSeeking={updateBuffering}
        onSeeked={updateBuffering}
        onPlay={updatePlayState}
        onPause={updatePlayState}
        onRateChange={updatePlayState}
        onEmptied={updatePlayState}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={onError}
      />
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
