import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachVideo, currentOffset, resumePosition, seekTo } from '../../timeline';
import { pause, play, playbackChanged } from '../../timeline/playback';

const NOT_UPLOADED = 'This video has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video.';

// Safari, and every browser on iOS, plays HLS natively and reports audio tracks
// itself. Everywhere else hls.js feeds the stream through Media Source Extensions.
function playsHlsNatively(video) {
  return Boolean(video.canPlayType('application/vnd.apple.mpegurl')) && 'audioTracks' in video;
}

// Attaches the stream to the video element. Returns a function that detaches it.
function loadStream(video, src, { onAudio, onError }) {
  if (playsHlsNatively(video)) {
    const reportAudio = () => onAudio(true);
    const reportError = () => onError(video.error?.code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR);
    video.audioTracks.addEventListener('addtrack', reportAudio);
    video.addEventListener('error', reportError);
    video.src = src;
    return () => {
      video.audioTracks.removeEventListener('addtrack', reportAudio);
      video.removeEventListener('error', reportError);
    };
  }

  let hls = null;
  let cancelled = false;
  import('hls.js/light').then(({ default: Hls }) => {
    if (cancelled) {
      return;
    }
    if (!Hls.isSupported()) {
      video.src = src;
      return;
    }
    let recoveredMediaError = false;
    hls = new Hls({ maxBufferLength: 40 });
    hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudio(Boolean(data.audio)));
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) {
        return; // hls.js retries these itself
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
        recoveredMediaError = true;
        hls.recoverMediaError();
        return;
      }
      hls.destroy();
      hls = null;
      if (data.response?.code === 404) {
        onError(NOT_UPLOADED);
      } else {
        onError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? NETWORK_ERROR : LOAD_ERROR);
      }
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  }).catch(() => onError(NETWORK_ERROR));

  return () => {
    cancelled = true;
    hls?.destroy();
  };
}

const VideoOverlay = ({ buffering, error, onRetry }) => {
  const visible = Boolean(error || buffering);
  // Delay the spinner so seeks into buffered video don't flash it.
  const visibility = visible ? `opacity-100 ${error ? '' : 'delay-300'}` : 'opacity-0 pointer-events-none';
  return (
    <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-4 text-center bg-[#16181AAA] transition-opacity duration-200 ${visibility}`}>
      {error ? (
        <>
          <ErrorOutline />
          <Typography>{error}</Typography>
          <Button variant="outlined" size="small" onClick={onRetry}>Try again</Button>
        </>
      ) : (
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
      )}
    </div>
  );
};

function DriveVideo({ dispatch, currentRoute, zoom, isPaused, isMuted, onAudioStatusChange }) {
  const videoRef = useRef(null);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const { fullname, share_exp: shareExp, share_sig: shareSig, videoStartOffset = 0 } = currentRoute;

  const syncPlayback = () => dispatch(playbackChanged(videoRef.current));

  useEffect(() => {
    attachVideo(videoRef.current, videoStartOffset, zoom);
  });
  useEffect(() => () => attachVideo(null), []);

  useEffect(() => {
    const video = videoRef.current;
    setError(null);
    onAudioStatusChange(false);
    const unload = loadStream(video, api.video.getQcameraStreamUrl(fullname, shareExp, shareSig), {
      onAudio: onAudioStatusChange,
      onError: (message) => {
        setError(message);
        syncPlayback();
      },
    });
    return () => {
      const resumeAt = currentOffset();
      unload();
      video.removeAttribute('src');
      video.load();
      seekTo(resumeAt); // held until a retried stream is ready
    };
  }, [fullname, shareExp, shareSig, attempt]);

  // Loops the selected range, and restarts it whenever the playhead ends up
  // outside: a new range was selected, or a browser dropped a seek made while
  // loading. The tolerance absorbs seeks landing just before a frame boundary.
  const keepInRange = () => {
    const offset = currentOffset();
    if (offset < zoom.start - 250 || offset >= zoom.end) {
      seekTo(zoom.start);
    }
  };
  useEffect(keepInRange, [zoom.start, zoom.end]);

  // timeupdate alone is too coarse to stop the loop on time
  useEffect(() => {
    if (isPaused) {
      return undefined;
    }
    let frame;
    const tick = () => {
      keepInRange();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPaused, zoom.start, zoom.end]);

  const onLoadedMetadata = () => {
    resumePosition();
    videoRef.current.play()?.catch(() => {
      // autoplay refused: wait for the play button
      setBuffering(false);
      syncPlayback();
    });
  };

  const onEnded = () => {
    seekTo(zoom.start);
    dispatch(play());
  };

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay buffering={buffering} error={error} onRetry={() => setAttempt((n) => n + 1)} />
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        muted={isMuted}
        preload="auto"
        onClick={() => dispatch(isPaused ? play() : pause())}
        onLoadStart={() => setBuffering(true)}
        onLoadedMetadata={onLoadedMetadata}
        onWaiting={() => setBuffering(true)}
        onSeeking={() => setBuffering(true)}
        onSeeked={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onPlay={syncPlayback}
        onPause={syncPlayback}
        onRateChange={syncPlayback}
        onTimeUpdate={keepInRange}
        onEnded={onEnded}
      />
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  isPaused: state.isPaused,
});

export default connect(stateToProps)(DriveVideo);
