import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { setVideoElement } from '../../timeline/video';
import { bufferVideo, pause, play } from '../../timeline/playback';
import { fileSegmentNumber } from '../../url';
import { playsHlsNatively } from '../../utils/browser';

const MISSING_VIDEO_ERROR = 'This video segment has not uploaded yet or has been deleted.';


const VideoOverlay = ({ loading, error }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  // fade the loading state in late, so quick seeks don't flash a spinner
  const fadeIn = error ? '' : 'transition-opacity duration-200 delay-250 starting:opacity-0';
  return (
    <div className={`z-50 absolute h-full w-full bg-[#16181AAA] ${fadeIn}`}>
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

const DriveVideo = ({ dispatch, currentRoute, desiredPlaySpeed, isBufferingVideo, offset, startTime, loop, isMuted, onAudioStatusChange }) => {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const missingRanges = useRef([]); // { start, end, segment } (video seconds) of segments that were never uploaded
  const [videoError, setVideoError] = useState(null);
  const [skippedSegment, setSkippedSegment] = useState(null);

  const setBuffering = (buffering) => {
    if (buffering !== isBufferingVideo) {
      dispatch(bufferVideo(buffering));
    }
  };

  // the video can't play: say why, and show the play button instead of pause
  const failVideo = (message) => {
    setVideoError(message);
    dispatch(pause());
  };

  // move the playhead to a route offset (ms), keeping it inside the part of the route that has video
  const seekTo = (routeOffset) => {
    const video = videoRef.current;
    let time = Math.max(0, (routeOffset - (currentRoute?.videoStartOffset || 0)) / 1000);
    if (Number.isFinite(video.duration)) {
      time = Math.min(time, video.duration);
    }
    video.currentTime = time;
  };

  // jump over a segment that was never uploaded instead of waiting at its start forever
  const skipMissingVideo = () => {
    const video = videoRef.current;
    const gap = missingRanges.current.find(({ start, end }) => video.currentTime >= start - 0.5 && video.currentTime < end);
    if (!gap) {
      return;
    }

    // the selected loop ends inside the gap: wrap to its start instead of skipping out of it,
    // unless the loop is entirely inside the gap and there is nothing to play
    const videoStartOffset = currentRoute?.videoStartOffset || 0;
    if (loop && (loop.startTime + loop.duration - videoStartOffset) / 1000 <= gap.end) {
      if ((loop.startTime - videoStartOffset) / 1000 >= gap.start - 0.5) {
        failVideo(MISSING_VIDEO_ERROR);
      } else {
        seekTo(loop.startTime);
      }
      return;
    }

    setSkippedSegment(gap.segment);
    // land a little inside the next segment: exactly on the boundary hls.js picks the missing one again
    const target = gap.end + 0.1;
    video.currentTime = target;
    // restart hls.js loading past the gap, otherwise it sits in its retry back-off for the missing segment
    hlsRef.current?.stopLoad();
    hlsRef.current?.startLoad(target);
  };

  // hls.js handlers are set up once per route, so they call the latest skipMissingVideo through this ref
  const skipMissingVideoRef = useRef(skipMissingVideo);
  skipMissingVideoRef.current = skipMissingVideo;

  const startPlaying = () => {
    const video = videoRef.current;
    video.playbackRate = desiredPlaySpeed;
    video.play().catch((err) => {
      // autoplay was blocked (e.g. iOS PWA, background tab): show the play button instead of a spinner
      if (err.name === 'NotAllowedError') {
        dispatch(pause());
        // dispatch directly: this runs later, when the isBufferingVideo setBuffering compares against may be stale
        dispatch(bufferVideo(false));
      }
    });
  };

  // the "segment skipped" notice fades away on its own
  useEffect(() => {
    if (skippedSegment === null) {
      return undefined;
    }
    const timeout = setTimeout(() => setSkippedSegment(null), 3000);
    return () => clearTimeout(timeout);
  }, [skippedSegment]);

  useEffect(() => {
    setVideoElement(videoRef.current);
    return () => setVideoElement(null);
  }, []);

  // load the route's stream
  useEffect(() => {
    const video = videoRef.current;
    setVideoError(null);
    missingRanges.current = [];
    onAudioStatusChange?.(false);
    if (!currentRoute) {
      return undefined;
    }

    setBuffering(true);
    let cancelled = false;
    let nativeAudioTracks = null;
    // Safari fills in audioTracks after the metadata has loaded, so wait for the track to show up
    const onAddTrack = () => onAudioStatusChange?.(true);

    const load = async () => {
      // the demo backend builds some playlists asynchronously, so this may be a promise
      const src = await api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      if (cancelled) {
        return;
      }
      if (playsHlsNatively()) {
        nativeAudioTracks = video.audioTracks;
        nativeAudioTracks?.addEventListener('addtrack', onAddTrack);
        video.src = src;
        return;
      }

      const { default: Hls } = await import('hls.js/light');
      if (cancelled) {
        return;
      }
      const hls = new Hls({ maxBufferLength: 40 });
      hlsRef.current = hls;
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && data.response?.code === 404 && data.frag) {
          // flag it like an #EXT-X-GAP segment so hls.js stops requesting it and moves on to the next one
          data.frag.gap = true;
          const { start, duration, url } = data.frag;
          if (!missingRanges.current.some((gap) => gap.start === start)) {
            missingRanges.current.push({ start, end: start + duration, segment: fileSegmentNumber(url) });
          }
          skipMissingVideoRef.current();
          return;
        }
        if (!data.fatal) {
          return;
        }
        // a 404 or an empty playlist both mean the video hasn't been uploaded
        const missing = data.response?.code === 404 || data.details === Hls.ErrorDetails.LEVEL_EMPTY_ERROR;
        failVideo(missing ? MISSING_VIDEO_ERROR : 'Unable to load video');
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    };
    load().catch(() => {
      // fetching the playlist or hls.js failed (e.g. offline)
      if (!cancelled) {
        failVideo('Unable to load video');
      }
    });

    return () => {
      cancelled = true;
      nativeAudioTracks?.removeEventListener('addtrack', onAddTrack);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [currentRoute?.fullname]);

  // seek requests from the timeline and controls
  useEffect(() => {
    if (videoRef.current.readyState > 0 && offset !== null) {
      seekTo(offset);
    }
  }, [startTime]);

  // play / pause / speed changes
  useEffect(() => {
    const video = videoRef.current;
    if (video.readyState === 0) {
      return; // onLoadedMetadata starts playback
    }
    if (desiredPlaySpeed) {
      startPlaying();
    } else {
      video.pause();
    }
  }, [desiredPlaySpeed]);

  const onLoadedMetadata = () => {
    seekTo(offset ?? loop?.startTime ?? 0);
    if (desiredPlaySpeed) {
      startPlaying();
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video.paused && video.readyState >= 2) {
      // native HLS can fire `waiting` without a matching `playing`; time moving means we're not buffering
      setBuffering(false);
    }
    const routeOffset = (video.currentTime * 1000) + (currentRoute?.videoStartOffset || 0);
    if (loop && routeOffset > loop.startTime + loop.duration) {
      seekTo(loop.startTime);
    }
  };

  // a selected range loops; the whole route stops at its end like a regular player (play restarts it).
  // `ended` only fires when the loop reaches the end of the video, so a loop that also starts at the
  // beginning of the video is the whole route
  const onEnded = () => {
    if (!loop || loop.startTime <= (currentRoute?.videoStartOffset || 0)) {
      dispatch(pause());
      return;
    }
    seekTo(loop.startTime);
    if (desiredPlaySpeed) {
      startPlaying();
    }
  };

  // keep redux in sync when the OS pauses or resumes us (lock screen, headphones unplugged, ...)
  const onPause = () => {
    const video = videoRef.current;
    if (desiredPlaySpeed && !video.ended && video.readyState > 0) {
      dispatch(pause());
    }
  };
  const onPlay = () => {
    if (!desiredPlaySpeed) {
      dispatch(play(videoRef.current.playbackRate));
    }
  };

  // hls.js reports its own errors; with native HLS (iPhone) only the media element's error code is known
  const onError = () => {
    const { error } = videoRef.current;
    if (playsHlsNatively() && error) {
      // Safari can't open a playlist that doesn't exist: same meaning as a 404 with hls.js
      const missing = error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;
      failVideo(missing ? MISSING_VIDEO_ERROR : 'Unable to load video');
    }
  };

  return (
    <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
      <VideoOverlay loading={isBufferingVideo} error={videoError} />
      {skippedSegment !== null && (
        <div className="z-50 absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#16181ACC] px-3 py-1 text-sm text-white transition-opacity starting:opacity-0">
          {`${Number.isNaN(skippedSegment) ? 'A segment' : `Segment ${skippedSegment}`} wasn't uploaded, skipped ahead`}
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        muted={isMuted}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onWaiting={() => {
          setBuffering(true);
          skipMissingVideo();
        }}
        onPlaying={() => {
          setBuffering(false);
          setVideoError(null); // playing again (e.g. after picking another range) clears an earlier error
        }}
        onSeeked={() => {
          setBuffering(videoRef.current.readyState < 2);
          skipMissingVideo();
        }}
        onEnded={onEnded}
        onPause={onPause}
        onPlay={onPlay}
        onError={onError}
      />
    </div>
  );
};

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  startTime: state.startTime,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
