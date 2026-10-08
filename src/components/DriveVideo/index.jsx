import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachPlayer, currentOffset, playerOffset } from '../../timeline';
import { bufferVideo, pause, syncPlayhead } from '../../timeline/playback';
import { isFirefox, isIos } from '../../utils/browser';
import {
  HAVE_METADATA, UNSUPPORTED, applyIntent, bufferLead, hlsErrorMessage, isBuffering, loopRestartOffset,
  mediaErrorMessage, videoTime,
} from './player';

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl';

const VideoOverlay = ({ buffering, error, onRetry }) => {
  if (!error && !buffering) {
    return null;
  }
  return (
    <div
      role="status"
      aria-label={error ? 'Video error' : 'Buffering'}
      className="animate-fadein absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#16181a]/70 px-6 text-center backdrop-blur-[2px]"
      // a short stall shouldn't flash a spinner
      style={error ? undefined : { animationDelay: '150ms', animationFillMode: 'backwards' }}
    >
      {error ? (
        <>
          <ErrorOutline className="text-white/70" />
          <Typography className="text-white/90">{error}</Typography>
          <Button
            onClick={onRetry}
            className="min-h-[unset] min-w-[90px] rounded-[15px] bg-[#5e8bff] px-6 py-1.5 normal-case text-white hover:bg-[#547de6] hover:text-white"
          >
            Retry
          </Button>
        </>
      ) : (
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={44} />
      )}
    </div>
  );
};

// The <video> element is the clock: it plays, and we report what it does. Redux only says what the
// user asked for (play, pause, speed, seek, loop); nothing here polls or nudges the video to catch up.
const DriveVideo = ({
  dispatch, currentRoute, desiredPlaySpeed, isBufferingVideo, loop, seekTo, isMuted, onAudioStatusChange,
}) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [error, setError] = useState(null); // { src, message }
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setError(null);
    setAttempt((count) => count + 1);
  };

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : null;
  const videoStartOffset = currentRoute?.videoStartOffset || 0;
  const shownError = error?.src === src ? error.message : null;

  // Event handlers outlive renders, so they read the latest props from here.
  const latest = useRef({});
  useEffect(() => {
    latest.current = { src, videoStartOffset, desiredPlaySpeed, isMuted, isBufferingVideo, loop, onAudioStatusChange };
  });
  // Where to start once the video has loaded, for a seek that arrived while it was loading.
  const startAt = useRef(null);

  // The playhead is the video's, for as long as it's on screen.
  useEffect(() => {
    const detach = attachPlayer(videoRef.current, () => latest.current.videoStartOffset);
    return () => {
      dispatch(bufferVideo(false, currentOffset())); // keep time going, and the place, without us
      detach();
    };
  }, [dispatch]);

  // Load the route.
  useEffect(() => {
    const video = videoRef.current;
    if (!src) {
      return undefined;
    }
    const fail = (message) => setError({ src, message });
    startAt.current = videoTime(currentOffset(), latest.current.videoStartOffset);
    let hls = null;
    let cancelled = false;

    const onVideoError = () => fail(mediaErrorMessage(video.error));
    const loadNatively = () => {
      video.addEventListener('error', onVideoError);
      video.src = src;
    };

    if (isIos() || !video.canPlayType) {
      loadNatively(); // iOS plays HLS itself, with its own audio handling
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) {
          return;
        }
        if (!Hls.isSupported()) {
          if (video.canPlayType(HLS_MIME_TYPE)) {
            loadNatively();
          } else {
            fail(UNSUPPORTED);
          }
          return;
        }
        let recoveredMedia = false;
        hls = new Hls({ maxBufferLength: bufferLead(latest.current.desiredPlaySpeed), startPosition: startAt.current });
        hlsRef.current = hls;
        hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => latest.current.onAudioStatusChange?.(!!data.audio));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) {
            return; // stalls and retried requests are handled by hls.js, and show up as buffering
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
            recoveredMedia = true;
            hls.recoverMediaError();
          } else {
            fail(hlsErrorMessage(data));
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      }).catch(() => fail(UNSUPPORTED));
    }

    return () => {
      cancelled = true;
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [src, attempt]);

  // Report what the video does.
  useEffect(() => {
    const video = videoRef.current;
    const reportBuffering = () => {
      const buffering = isBuffering(video);
      if (buffering !== latest.current.isBufferingVideo) {
        dispatch(bufferVideo(buffering, currentOffset()));
      }
    };
    const reportPlayhead = () => dispatch(syncPlayhead(currentOffset()));
    const blocked = () => dispatch(pause()); // the browser wants a tap before it plays

    const listeners = {
      loadstart: reportBuffering,
      waiting: reportBuffering,
      seeking: reportBuffering,
      seeked: reportBuffering,
      canplay: reportBuffering,
      playing: () => {
        setError(null);
        reportBuffering();
      },
      pause: reportPlayhead,
      ratechange: reportPlayhead,
      ended: () => {
        dispatch(pause());
        reportPlayhead();
      },
      loadedmetadata: () => {
        const { desiredPlaySpeed: speed, isMuted: muted, onAudioStatusChange: onAudio } = latest.current;
        if (startAt.current !== null && Math.abs(video.currentTime - startAt.current) > 0.5) {
          video.currentTime = startAt.current;
        }
        startAt.current = null;
        if (video.audioTracks) { // native HLS; hls.js reports audio from the stream itself
          onAudio?.(video.audioTracks.length > 0);
        }
        applyIntent(video, { speed, muted, firefox: isFirefox() }, blocked);
        reportBuffering();
      },
    };
    Object.entries(listeners).forEach(([name, listener]) => video.addEventListener(name, listener));
    return () => Object.entries(listeners).forEach(([name, listener]) => video.removeEventListener(name, listener));
  }, [dispatch]);

  // Do what the user asked: play, pause, change speed.
  useEffect(() => {
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.config.maxBufferLength = bufferLead(desiredPlaySpeed);
    }
    if (video.readyState >= HAVE_METADATA) { // before that, loadedmetadata does it
      applyIntent(video, { speed: desiredPlaySpeed, muted: isMuted, firefox: isFirefox() }, () => dispatch(pause()));
    }
  }, [dispatch, desiredPlaySpeed, isMuted]);

  // Do what the user asked: go somewhere else. Skip the seek that happened before we were here.
  const handledSeek = useRef(seekTo);
  useEffect(() => {
    if (!seekTo || seekTo === handledSeek.current) {
      return;
    }
    handledSeek.current = seekTo;
    const video = videoRef.current;
    const target = videoTime(seekTo.offset, videoStartOffset);
    if (video.readyState >= HAVE_METADATA) {
      video.currentTime = target;
    } else {
      startAt.current = target;
    }
  }, [seekTo, videoStartOffset]);

  // Loop over the selected range.
  useEffect(() => {
    let frame;
    const tick = () => {
      const video = videoRef.current;
      const offset = playerOffset();
      const restart = offset === null || video.seeking ? null : loopRestartOffset(offset, latest.current.loop);
      if (restart !== null) {
        video.currentTime = videoTime(restart, latest.current.videoStartOffset);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative mx-auto aspect-[1.593] min-h-[200px] max-w-[964px] overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        aria-label="Drive video"
        className="h-full w-full object-contain"
        muted={isMuted}
        playsInline
        preload="auto"
      />
      <VideoOverlay
        buffering={isBufferingVideo}
        error={shownError}
        onRetry={retry}
      />
    </div>
  );
};

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  loop: state.loop,
  seekTo: state.seekTo,
});

export default connect(stateToProps)(DriveVideo);
