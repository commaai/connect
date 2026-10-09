import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import Hls from 'hls.js';

import { api } from '../../api/backend';
import { seek } from '../../actions';

import Colors from '../../colors';
import { ChevronRight, ErrorOutline } from '../../icons';
import { attachVideo, currentOffset, detachVideo } from '../../timeline';
import { pause } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video';
// two taps closer than this are a double tap, in milliseconds
const DOUBLE_TAP = 300;
// a double tap jumps this far, in milliseconds
const JUMP = 10 * 1000;
// how long the arrow of a jump stays on screen, in milliseconds
const JUMP_ARROW = 500;

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

// Start loading the video. iOS plays the stream by itself, other browsers need hls.js.
// Returns the hls.js player, or null when the browser plays the stream by itself.
function loadVideo(video, src, onAudio, onError) {
  if (isIos() || !Hls.isSupported()) {
    video.src = src;
    video.addEventListener('loadedmetadata', () => onAudio(video.audioTracks?.length > 0), { once: true });
    return null;
  }

  const hls = new Hls({ maxBufferLength: 40 });
  let mediaRecoveries = 0;
  hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudio(Boolean(data.audio)));
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) {
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
      // a broken frame: hls.js can usually skip past it
      mediaRecoveries += 1;
      hls.recoverMediaError();
    } else if (data.response?.code === 404) {
      onError(NOT_UPLOADED);
    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      onError(NETWORK_ERROR);
    } else {
      onError(LOAD_ERROR);
    }
  });
  hls.loadSource(src);
  hls.attachMedia(video);
  return hls;
}

const DriveVideo = ({ dispatch, currentRoute, desiredPlaySpeed, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const lastTap = useRef(0);
  const jumpArrowTimer = useRef(null);
  const [jumpArrow, setJumpArrow] = useState(null); // 'back' or 'forward' while shown
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

  // load the drive's video, again on every retry
  useEffect(() => {
    if (!src) {
      return undefined;
    }
    const video = videoRef.current;
    setError(null);
    onAudioStatusChange?.(false);
    const hls = loadVideo(video, src, (hasAudio) => onAudioStatusChange?.(hasAudio), setError);

    // stop loading when the drive changes or the video goes away
    return () => {
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
    if (!code || code === MediaError.MEDIA_ERR_ABORTED) {
      return; // we stopped the loading ourselves
    }
    setError(code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR);
  };

  // double tap or double click on the left or right half to jump, like youtube
  const onPointerUp = (ev) => {
    if (ev.button !== 0 || ev.target.closest('button')) {
      return;
    }
    if (ev.timeStamp - lastTap.current > DOUBLE_TAP) {
      lastTap.current = ev.timeStamp;
      return;
    }
    lastTap.current = 0;
    const box = ev.currentTarget.getBoundingClientRect();
    const onRightHalf = ev.clientX > box.left + (box.width / 2);
    if (onRightHalf) {
      dispatch(seek(currentOffset() + JUMP));
    } else {
      dispatch(seek(currentOffset() - JUMP));
    }
    // show which way and how far it jumped
    clearTimeout(jumpArrowTimer.current);
    setJumpArrow(onRightHalf ? 'forward' : 'back');
    jumpArrowTimer.current = setTimeout(() => setJumpArrow(null), JUMP_ARROW);
  };
  useEffect(() => () => clearTimeout(jumpArrowTimer.current), []);

  return (
    <div
      className="absolute inset-0 bg-black touch-manipulation"
      onPointerUp={onPointerUp}
    >
      {src && <VideoOverlay loading={loading} error={error} onRetry={() => setAttempt(attempt + 1)} />}
      {jumpArrow && (
        <div
          key={jumpArrow}
          className={`pointer-events-none absolute inset-y-0 z-[60] flex items-center animate-fadein ${jumpArrow === 'forward' ? 'right-4' : 'left-4'}`}
        >
          <div className={`flex items-center rounded-full bg-black/40 p-2 text-white ${jumpArrow === 'back' ? 'flex-row-reverse pr-4' : 'pl-4'}`}>
            <span className="text-lg font-semibold">{`${JUMP / 1000}s`}</span>
            <ChevronRight className={jumpArrow === 'back' ? 'rotate-180' : ''} style={{ fontSize: 48 }} />
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        muted={isMuted}
        onLoadedMetadata={applyPlayIntent}
        // spinner while the video has nothing to show yet
        onLoadStart={() => setLoading(true)}
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
