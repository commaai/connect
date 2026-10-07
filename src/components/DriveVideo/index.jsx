import React, { useEffect, useRef, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { setVideoElement } from '../../timeline';
import { bufferVideo, pause, play } from '../../timeline/playback';
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
    if (gap) {
      setSkippedSegment(gap.segment);
      // land a little inside the next segment: exactly on the boundary hls.js picks the missing one again
      const target = gap.end + 0.1;
      video.currentTime = target;
      // restart hls.js loading past the gap, otherwise it sits in its retry back-off for the missing segment
      hlsRef.current?.stopLoad();
      hlsRef.current?.startLoad(target);
    }
  };

  const startPlaying = () => {
    const video = videoRef.current;
    video.playbackRate = desiredPlaySpeed;
    video.play().catch((err) => {
      // autoplay was blocked (e.g. iOS PWA, background tab): show the play button instead of a spinner
      if (err.name === 'NotAllowedError') {
        dispatch(pause());
        setBuffering(false);
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
            // segment files live at .../<segment>/qcamera.ts
            const segment = Number(url.match(/\/(\d+)\/qcamera\.ts/)?.[1] ?? NaN);
            missingRanges.current.push({ start, end: start + duration, segment });
          }
          skipMissingVideo();
          return;
        }
        if (!data.fatal) {
          return;
        }
        // a 404 or an empty playlist both mean the video hasn't been uploaded
        const missing = data.response?.code === 404 || data.details === Hls.ErrorDetails.LEVEL_EMPTY_ERROR;
        setVideoError(missing ? MISSING_VIDEO_ERROR : 'Unable to load video');
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    };
    load().catch(() => {
      // fetching the playlist or hls.js failed (e.g. offline)
      if (!cancelled) {
        setVideoError('Unable to load video');
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

  const onEnded = () => {
    seekTo(loop?.startTime ?? 0);
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

  const onError = () => {
    if (playsHlsNatively() && videoRef.current.error) {
      setVideoError('Unable to load video');
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
        onPlaying={() => setBuffering(false)}
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
