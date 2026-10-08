import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachVideo, detachVideo } from '../../timeline';
import { pause } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <button type="button" className="mt-4 rounded-full bg-white/10 px-5 py-2 text-sm hover:bg-white/20" onClick={onRetry}>
          Retry
        </button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute inset-0 flex flex-col items-center justify-center text-center bg-[#16181AAA]">
      {content}
    </div>
  );
};

function loadNative(video, src, onAudio) {
  video.src = src;
  video.addEventListener('loadedmetadata', () => onAudio(video.audioTracks?.length > 0), { once: true });
  return null;
}

// iOS plays HLS natively, everywhere else hls.js feeds the video through MSE
async function loadStream(video, src, { onAudio, onError }) {
  if (isIos()) {
    return loadNative(video, src, onAudio);
  }

  const { default: Hls } = await import('hls.js');
  if (!Hls.isSupported()) {
    return loadNative(video, src, onAudio);
  }
  const hls = new Hls({ maxBufferLength: 40 });
  let mediaRecoveries = 0;
  hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudio(Boolean(data.audio)));
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) {
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
      mediaRecoveries += 1;
      hls.recoverMediaError();
    } else if (data.response?.code === 404) {
      onError(NOT_UPLOADED);
    } else {
      onError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? NETWORK_ERROR : LOAD_ERROR);
    }
  });
  hls.loadSource(src);
  hls.attachMedia(video);
  return hls;
}

const DriveVideo = ({ dispatch, currentRoute, desiredPlaySpeed, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : null;
  const videoStartOffset = currentRoute?.videoStartOffset || 0;

  // the video is the playback clock
  useEffect(() => {
    attachVideo(videoRef.current, videoStartOffset);
    return detachVideo;
  }, [videoStartOffset]);

  useEffect(() => {
    const video = videoRef.current;
    if (!src) {
      return undefined;
    }

    let cancelled = false;
    let hls = null;
    setError(null);
    onAudioStatusChange?.(false);
    loadStream(video, src, {
      onAudio: (hasAudio) => onAudioStatusChange?.(hasAudio),
      onError: setError,
    }).then((instance) => {
      hls = instance;
      if (cancelled) {
        hls?.destroy();
      }
    }).catch(() => !cancelled && setError(NETWORK_ERROR));

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, attempt]);

  // follow the user's play/pause and speed
  const applyPlayIntent = () => {
    const video = videoRef.current;
    if (desiredPlaySpeed === 0) {
      video.pause();
      return;
    }
    video.playbackRate = desiredPlaySpeed;
    if (video.paused) {
      video.play().catch((err) => {
        // autoplay was blocked: show it as paused until the user presses play
        if (err.name === 'NotAllowedError') {
          dispatch(pause());
        }
      });
    }
  };
  useEffect(applyPlayIntent, [desiredPlaySpeed]);

  useEffect(() => {
    videoRef.current.muted = isMuted;
  }, [isMuted]);

  const onPause = () => {
    // paused by the browser or the OS rather than by us, e.g. a phone call
    if (desiredPlaySpeed !== 0 && !videoRef.current.ended) {
      dispatch(pause());
    }
  };

  const onError = () => {
    const code = videoRef.current.error?.code;
    if (code && code !== MediaError.MEDIA_ERR_ABORTED) {
      setError((current) => current || (code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR));
    }
  };

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
      <VideoOverlay loading={loading} error={error} onRetry={() => setAttempt(attempt + 1)} />
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        muted={isMuted}
        onLoadStart={() => setLoading(true)}
        onLoadedMetadata={applyPlayIntent}
        onWaiting={() => setLoading(true)}
        onSeeking={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onSeeked={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
        onPause={onPause}
        onError={onError}
      />
    </div>
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
});

export default connect(stateToProps)(DriveVideo);
