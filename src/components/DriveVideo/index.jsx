import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachVideo, currentOffset } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';

const DriveVideo = ({ dispatch, currentRoute, desiredPlaySpeed, offset, seekTime, loop, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const src = currentRoute
    ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
    : null;
  const toVideoTime = (routeOffset) => Math.max(0, (routeOffset - (currentRoute?.videoStartOffset || 0)) / 1000);
  const loopStart = loop?.startTime || 0;

  // the video is the playback clock, everything else reads it through currentOffset()
  useEffect(() => {
    attachVideo(videoRef.current);
    return () => attachVideo(null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    setError(null);
    if (!src) {
      return undefined;
    }

    // iOS plays HLS natively, everything else goes through hls.js
    if (isIos()) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    let cancelled = false;
    import('hls.js/light').then(({ default: Hls }) => {
      if (cancelled) {
        return;
      }
      if (!Hls.isSupported()) {
        video.src = src;
        return;
      }

      const hls = new Hls({ maxBufferLength: 40 });
      let recoveredMediaError = false;
      hls.on(Hls.Events.BUFFER_CODECS, (_, data) => onAudioStatusChange?.(Boolean(data.audio)));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
          recoveredMediaError = true;
          hls.recoverMediaError();
          return;
        }
        setError(data.response?.code === 404 ? NOT_UPLOADED : 'Unable to load video');
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    });

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, attempt]);

  // seeks are requests to the video, which reports back the time it actually lands on
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = toVideoTime(offset ?? loopStart);
    }
  }, [offset, seekTime]);

  const applyPlaySpeed = () => {
    const video = videoRef.current;
    if (!desiredPlaySpeed) {
      video.pause();
      return;
    }
    // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x
    const rate = Math.min(desiredPlaySpeed, (isFirefox() && !isMuted) ? 8 : 16);
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
    if (video.paused && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.play().catch((err) => {
        // unmuted autoplay can be blocked, show the play button instead of a stuck video
        if (err.name === 'NotAllowedError') {
          dispatch(pause());
        }
      });
    }
  };
  // layout effect so play() runs inside the click that requested it, which iOS requires
  useLayoutEffect(applyPlaySpeed, [desiredPlaySpeed, isMuted, seekTime]);

  const restartLoop = () => {
    videoRef.current.currentTime = toVideoTime(loopStart);
    applyPlaySpeed();
  };

  const updateLoading = () => {
    const video = videoRef.current;
    setLoading(video.seeking || video.readyState < (video.paused ? HTMLMediaElement.HAVE_CURRENT_DATA : HTMLMediaElement.HAVE_FUTURE_DATA));
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!hlsRef.current) {
      onAudioStatusChange?.(video.audioTracks?.length > 0);
    }
    video.currentTime = toVideoTime(offset ?? loopStart);
    applyPlaySpeed();
    updateLoading();
  };

  // ponytail: timeupdate fires every ~250ms, so a selection can overshoot its end by that much video time
  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (loop && currentOffset() >= loopStart + loop.duration && video.currentTime > toVideoTime(loopStart)) {
      restartLoop();
    }
  };

  // the browser or OS can pause and resume the video on its own (lock screen, headphones, backgrounding)
  const onPlay = () => {
    if (!videoRef.current.paused && !desiredPlaySpeed) {
      dispatch(play(videoRef.current.playbackRate));
    }
    updateLoading();
  };

  const onPause = () => {
    const video = videoRef.current;
    if (video.paused && !video.ended && desiredPlaySpeed) {
      dispatch(pause());
    }
    updateLoading();
  };

  const onError = () => {
    // hls.js reports and recovers from its own errors
    if (!hlsRef.current && videoRef.current.error) {
      setError('Unable to load video');
    }
  };

  const retry = () => {
    dispatch(seek(currentOffset()));
    setAttempt((n) => n + 1);
  };

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        muted={isMuted}
        onLoadedMetadata={onLoadedMetadata}
        onLoadStart={updateLoading}
        onWaiting={updateLoading}
        onSeeking={updateLoading}
        onSeeked={updateLoading}
        onCanPlay={updateLoading}
        onPlaying={updateLoading}
        onPlay={onPlay}
        onPause={onPause}
        onTimeUpdate={onTimeUpdate}
        onEnded={restartLoop}
        onError={onError}
      />
      {error ? (
        <div className="z-50 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-[#16181AAA]">
          <ErrorOutline />
          <Typography>{error}</Typography>
          <Button variant="outlined" size="small" style={{ color: Colors.white, borderColor: Colors.white30 }} onClick={retry}>
            Retry
          </Button>
        </div>
      ) : (
        <div
          className={`z-50 absolute inset-0 flex items-center justify-center bg-[#16181AAA] pointer-events-none transition-opacity ${
            loading ? 'opacity-100 delay-300' : 'opacity-0'}`}
        >
          <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
        </div>
      )}
    </div>
  );
};

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekTime: state.seekTime,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
