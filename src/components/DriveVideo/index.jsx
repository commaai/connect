import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, RefreshIcon } from '../../icons';
import {
  pause, play, resetPlayback, setHasAudio, setVideoStatus, videoProgress, VideoStatus,
} from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video';
const OUT_OF_RANGE = 'No video for this part of the drive';

// iOS and iPadOS play HLS natively, everywhere else hls.js feeds the video through MSE
function prefersNativeHls() {
  return isIos() || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function hlsErrorMessage(data) {
  if (data.response?.code === 404) {
    return NOT_UPLOADED;
  }
  return data.type === 'networkError' ? NETWORK_ERROR : LOAD_ERROR;
}

// whether any of the range has video, the camera starts recording after the logs do
function coversLoop(duration, videoStartOffset, loop) {
  if (!loop || !duration) {
    return true;
  }
  return loop.startTime + loop.duration > videoStartOffset && loop.startTime < videoStartOffset + (duration * 1000);
}

function clampToLoop(offset, loop) {
  return loop ? Math.min(Math.max(offset, loop.startTime), loop.startTime + loop.duration) : offset;
}

const VideoOverlay = ({ loading, message, onRetry }) => {
  if (message) {
    return (
      <div className="z-50 absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center bg-[#16181AAA]">
        <ErrorOutline />
        <Typography>{message}</Typography>
        {onRetry && (
          <Button
            className="flex items-center gap-2 rounded-3xl px-5 py-2 text-white text-sm normal-case bg-white/10 hover:bg-white/20"
            onClick={onRetry}
            disableRipple
          >
            <RefreshIcon style={{ fontSize: 18 }} />
            Retry
          </Button>
        )}
      </div>
    );
  }
  return (
    <div
      className={`z-50 absolute inset-0 flex items-center justify-center bg-[#16181AAA] pointer-events-none transition-opacity
        ${loading ? 'opacity-100 duration-300 delay-300' : 'opacity-0 duration-150'}`}
    >
      <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
    </div>
  );
};

const RouteVideo = (props) => {
  const { dispatch, currentRoute, loop, seekRequest, isPlaying, desiredPlaySpeed, videoStatus, isMuted } = props;
  const videoRef = useRef(null);
  const nativeHls = useRef(false);
  const pendingSeek = useRef(true);
  const gapAt = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(null);
  const [duration, setDuration] = useState(null);

  const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
  const videoStartOffset = currentRoute.videoStartOffset || 0;
  const inRange = coversLoop(duration, videoStartOffset, loop);
  const message = error || (inRange ? null : OUT_OF_RANGE);

  const latest = useRef();
  latest.current = { ...props, videoStartOffset, playable: !message };

  const getState = () => dispatch((_dispatch, get) => get());

  const toVideoTime = (offset) => Math.max(0, offset - latest.current.videoStartOffset) / 1000;

  const seekTo = (offset) => {
    const video = videoRef.current;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = toVideoTime(clampToLoop(offset, latest.current.loop));
    }
  };

  const fail = (text) => {
    setError(text);
    dispatch(setVideoStatus(VideoStatus.FAILED));
  };

  useEffect(() => {
    dispatch(resetPlayback());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const { currentRoute: route, offset } = getState();
    let hls = null;
    let cancelled = false;

    setError(null);
    setDuration(null);
    pendingSeek.current = true;
    gapAt.current = null;
    nativeHls.current = prefersNativeHls();
    dispatch(setVideoStatus(VideoStatus.LOADING));

    if (nativeHls.current) {
      video.src = src;
    } else {
      import('hls.js/light').then(({ default: Hls }) => {
        if (cancelled) {
          return;
        }
        if (!Hls.isSupported()) {
          nativeHls.current = true;
          video.src = src;
          return;
        }

        let recovered = false;
        hls = new Hls({
          maxBufferLength: 40,
          startPosition: toVideoTime(offset),
          ...api.video.getHlsOptions?.(route, Hls),
        });
        hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => dispatch(setHasAudio(Boolean(data.audio))));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          // a segment that was never uploaded won't appear on a retry, so don't
          // wait out hls.js's backoff. Play what is buffered up to it first.
          if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && data.response?.code === 404) {
            hls.stopLoad();
            const playhead = video.readyState >= HTMLMediaElement.HAVE_METADATA
              ? video.currentTime
              : toVideoTime(getState().offset);
            if (data.frag.start > playhead + 1) {
              gapAt.current = data.frag.start;
            } else {
              fail(NOT_UPLOADED);
            }
            return;
          }
          if (!data.fatal) {
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            hls.recoverMediaError();
            return;
          }
          fail(hlsErrorMessage(data));
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      }).catch(() => {
        if (!cancelled) {
          fail(LOAD_ERROR);
        }
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, attempt]);

  useEffect(() => {
    if (!seekRequest) {
      return;
    }
    // hls.js stops loading once it hits a missing segment, even before playback reaches it
    if (error || gapAt.current !== null) {
      setAttempt((n) => n + 1);
    } else {
      seekTo(seekRequest.offset);
    }
  }, [seekRequest]);

  useEffect(() => {
    seekTo(getState().offset);
  }, [loop]);

  useEffect(() => {
    if (!inRange) {
      dispatch(setVideoStatus(VideoStatus.FAILED));
    } else if (!error) {
      const ready = videoRef.current.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
      dispatch(setVideoStatus(ready ? VideoStatus.READY : VideoStatus.LOADING));
    }
  }, [inRange]);

  const applyPlayState = () => {
    const video = videoRef.current;
    if (latest.current.isPlaying && latest.current.playable) {
      video.defaultPlaybackRate = latest.current.desiredPlaySpeed;
      video.playbackRate = latest.current.desiredPlaySpeed;
      if (video.paused && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        video.play().catch((err) => {
          if (err.name === 'NotAllowedError') {
            dispatch(pause());
          }
        });
      }
    } else if (!video.paused) {
      video.pause();
    }
  };

  useLayoutEffect(applyPlayState, [isPlaying, desiredPlaySpeed, message]);

  useLayoutEffect(() => {
    videoRef.current.muted = isMuted;
  }, [isMuted]);

  const reachedGap = () => {
    if (gapAt.current !== null && videoRef.current.currentTime >= gapAt.current - 0.5) {
      gapAt.current = null;
      fail(NOT_UPLOADED);
      return true;
    }
    return false;
  };

  const report = () => {
    const video = videoRef.current;
    const { loop: range, offset, playable } = latest.current;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA || video.seeking || !playable || reachedGap()) {
      return;
    }
    const position = Math.round(video.currentTime * 1000) + latest.current.videoStartOffset;
    if (range && !video.paused && position >= range.startTime + range.duration) {
      seekTo(range.startTime);
    } else if (position !== offset) {
      dispatch(videoProgress(position));
    }
  };

  // timeupdate only fires every ~250ms, follow every frame while playing
  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }
    let frame = requestAnimationFrame(function tick() {
      report();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    setDuration(video.duration);
    reportNativeAudio();
    // apply seeks made while loading, but not when hls.js reattaches to recover from an error
    if (pendingSeek.current) {
      pendingSeek.current = false;
      seekTo(getState().offset);
    }
    applyPlayState();
  };

  // native HLS can add the audio track after loadedmetadata, it is there by canplay
  const reportNativeAudio = () => {
    if (nativeHls.current) {
      dispatch(setHasAudio(Boolean(videoRef.current.audioTracks?.length)));
    }
  };

  const onPlay = () => {
    if (!latest.current.isPlaying) {
      dispatch(play());
    }
  };

  const onPause = () => {
    const video = videoRef.current;
    if (latest.current.isPlaying && latest.current.playable && !video.ended) {
      dispatch(pause());
    }
  };

  const onEnded = () => {
    seekTo(latest.current.loop?.startTime ?? 0);
    applyPlayState();
  };

  const onError = () => {
    const video = videoRef.current;
    // hls.js reports its own errors, including those of the element it drives
    if (nativeHls.current && video.error) {
      fail(video.error.code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR);
    }
  };

  const setLoading = (loading) => {
    const status = loading ? VideoStatus.LOADING : VideoStatus.READY;
    // events can arrive faster than renders, so compare with the store
    if (latest.current.playable && getState().videoStatus !== status) {
      dispatch(setVideoStatus(status));
    }
  };

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay
        loading={videoStatus === VideoStatus.LOADING}
        message={message}
        onRetry={error ? () => setAttempt((n) => n + 1) : null}
      />
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        muted={isMuted}
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={() => setDuration(videoRef.current.duration)}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onTimeUpdate={report}
        onSeeked={() => { report(); setLoading(videoRef.current.readyState < HTMLMediaElement.HAVE_FUTURE_DATA); }}
        onWaiting={() => reachedGap() || setLoading(true)}
        onSeeking={() => reachedGap() || setLoading(true)}
        onCanPlay={() => { reportNativeAudio(); setLoading(false); }}
        onPlaying={() => setLoading(false)}
        onError={onError}
      />
    </div>
  );
};

const DriveVideo = (props) => (props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} />
  : null);

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  isPlaying: state.isPlaying,
  loop: state.loop,
  offset: state.offset,
  seekRequest: state.seekRequest,
  videoStatus: state.videoStatus,
});

export default connect(stateToProps)(DriveVideo);
