import React, { useEffect, useRef, useState } from "react";
import { connect } from "react-redux";
import { Button, CircularProgress, Typography } from "@material-ui/core";
import Hls from "hls.js";

import { api } from "../../api/backend";
import { registerVideoClock } from "../../timeline";
import {
  bufferVideo,
  pause,
  play,
  videoProgress,
} from "../../timeline/playback";
import { isIos } from "../../utils/browser";

function videoBounds(video, { currentRoute, loop }) {
  const origin = currentRoute.videoStartOffset ?? 0;
  const start = Math.max(0, ((loop?.startTime ?? 0) - origin) / 1000);
  const routeEnd = loop
    ? loop.startTime + loop.duration
    : currentRoute.duration;
  const end = Math.min(
    (routeEnd - origin) / 1000,
    Number.isFinite(video.duration) ? video.duration : Infinity,
  );
  return { origin, start, end };
}

// A new source gets a new element, isolating pending play promises and media events.
export function RouteVideo(props) {
  const {
    src,
    dispatch,
    desiredPlaySpeed,
    isMuted,
    onMuteChange,
    onAudioStatusChange,
    seekVersion,
    currentRoute,
    loop,
  } = props;
  const videoRef = useRef(null);
  const latest = useRef(props);
  latest.current = props;
  const pendingSeek = useRef(true);
  const sourceActive = useRef(false);
  const lastSpeed = useRef(desiredPlaySpeed || 1);
  if (desiredPlaySpeed) lastSpeed.current = desiredPlaySpeed;
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const bounds =
    ready && videoRef.current ? videoBounds(videoRef.current, props) : null;
  const selectionUnavailable = bounds && bounds.end <= bounds.start;

  const reportPosition = () => {
    const video = videoRef.current;
    if (!pendingSeek.current && video.readyState > 0) {
      dispatch(
        videoProgress(
          currentRoute.fullname,
          video.currentTime * 1000 + (currentRoute.videoStartOffset ?? 0),
          seekVersion,
        ),
      );
    }
  };

  const updateBuffering = (buffering) => {
    setLoading(buffering);
    dispatch(bufferVideo(buffering));
  };

  const applySeek = () => {
    const video = videoRef.current;
    if (video.readyState === 0) return;
    const { origin, start, end } = videoBounds(video, latest.current);
    const offset = latest.current.offset ?? origin + start * 1000;
    const target = Math.max(start, Math.min(end, (offset - origin) / 1000));
    pendingSeek.current = false;
    if (
      Number.isFinite(target) &&
      Math.abs(video.currentTime - target) > 0.01
    ) {
      video.currentTime = target;
    }
    reportPosition();
  };

  useEffect(() => {
    const video = videoRef.current;
    let active = true;
    let frame;
    let hls;
    sourceActive.current = true;
    setError(null);
    setReady(false);
    setNeedsPlay(false);
    updateBuffering(true);
    pendingSeek.current = true;
    onAudioStatusChange?.(false);

    const fail = (message) => {
      if (!active) return;
      setError(message);
      updateBuffering(false);
      video.pause();
      dispatch(pause());
    };
    const onMediaError = () => {
      if (video.error?.code === 1) return; // aborted by a source change
      console.warn(
        "Video playback failed",
        video.error?.code,
        video.error?.message,
      );
      fail(
        video.error?.code === 2
          ? "Unable to load video. Check your connection."
          : "This video is unavailable or cannot be played.",
      );
    };
    video.addEventListener("error", onMediaError);

    // Safari's native HLS handles audio and iOS PWA playback. Chromium may
    // advertise HLS support without supporting the route's MPEG-TS segments.
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    if (
      nativeHls &&
      (isIos() || navigator.vendor?.includes("Apple") || !Hls.isSupported())
    ) {
      video.src = src;
      video.load();
    } else if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 40 });
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
        if (active) onAudioStatusChange?.(Boolean(data.audio));
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        // HLS retries transient errors itself; only terminal errors need UI.
        if (!data.fatal) return;
        fail(
          data.response?.code === 404
            ? "This video segment has not uploaded yet or has been deleted."
            : data.type === Hls.ErrorTypes.NETWORK_ERROR
              ? "Unable to load video. Check your connection."
              : "Unable to decode this video.",
        );
      });
      hls.attachMedia(video);
    } else {
      fail("Video playback is not supported in this browser.");
    }

    const unregister = registerVideoClock(
      () => {
        if (pendingSeek.current || video.readyState === 0) return undefined;
        return (
          video.currentTime * 1000 +
          (latest.current.currentRoute.videoStartOffset ?? 0)
        );
      },
      {
        play(speed) {
          video.playbackRate = speed;
          if (video.readyState === 0) return;
          video.play()?.catch((err) => {
            if (!active || err.name === "AbortError") return;
            setNeedsPlay(true);
            updateBuffering(false);
            dispatch(pause());
          });
        },
        setMuted(muted) {
          video.muted = muted;
        },
      },
    );
    const checkLoop = () => {
      if (!video.paused && !video.seeking && !pendingSeek.current) {
        const { start, end } = videoBounds(video, latest.current);
        if (latest.current.loop && end > start && video.currentTime >= end) {
          video.currentTime = start;
        }
      }
      frame = requestAnimationFrame(checkLoop);
    };
    frame = requestAnimationFrame(checkLoop);
    return () => {
      active = false;
      sourceActive.current = false;
      unregister();
      cancelAnimationFrame(frame);
      video.removeEventListener("error", onMediaError);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, attempt, dispatch, onAudioStatusChange]);

  useEffect(() => {
    pendingSeek.current = true;
    applySeek();
  }, [
    seekVersion,
    currentRoute.videoStartOffset,
    loop?.startTime,
    loop?.duration,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    let active = true;
    video.muted = isMuted;
    if (selectionUnavailable) {
      video.pause();
      dispatch(pause());
      updateBuffering(false);
      return;
    }
    if (desiredPlaySpeed > 0) {
      video.playbackRate = desiredPlaySpeed;
      if (!ready || video.readyState === 0) return;
      video.play()?.catch((err) => {
        if (!active || err.name === "AbortError") return;
        updateBuffering(false);
        if (err.name === "NotAllowedError") setNeedsPlay(true);
        else
          setError(
            (previous) =>
              previous || "Unable to play this video. Please try again.",
          );
        dispatch(pause());
      });
    } else {
      video.pause();
    }
    return () => {
      active = false;
    };
  }, [
    desiredPlaySpeed,
    isMuted,
    attempt,
    ready,
    selectionUnavailable,
    dispatch,
  ]);

  const onReady = () => {
    if (pendingSeek.current) applySeek();
    const video = videoRef.current;
    setReady(true);
    if (video.audioTracks) onAudioStatusChange?.(video.audioTracks.length > 0);
    else if (video.mozHasAudio || video.webkitAudioDecodedByteCount > 0)
      onAudioStatusChange?.(true);
    if (!video.seeking) updateBuffering(false);
  };

  const onEnded = () => {
    const video = videoRef.current;
    const { start, end } = videoBounds(video, props);
    if (loop && end > start) {
      video.currentTime = start;
      video.play()?.catch((err) => {
        if (!sourceActive.current || err.name === "AbortError") return;
        setNeedsPlay(true);
        dispatch(pause());
      });
    } else {
      reportPosition();
      dispatch(pause());
    }
  };

  const onSeeked = () => {
    const video = videoRef.current;
    const { start, end } = videoBounds(video, props);
    const target = Math.max(start, Math.min(end, video.currentTime));
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target;
      return;
    }
    reportPosition();
    onReady();
  };

  const startPlayback = () => {
    // Call play inside the gesture, which is required for audible playback on iOS.
    const video = videoRef.current;
    video.playbackRate = lastSpeed.current;
    video.play()?.catch((err) => {
      if (!sourceActive.current || err.name === "AbortError") return;
      setNeedsPlay(true);
      dispatch(pause());
    });
    dispatch(play(lastSpeed.current));
  };

  return (
    <div className="relative m-auto w-full aspect-[1.593] max-w-[964px] overflow-hidden rounded-lg bg-black">
      <video
        key={attempt}
        ref={videoRef}
        aria-label="Drive video"
        className="h-full w-full"
        playsInline
        controls
        muted={isMuted}
        preload="auto"
        onLoadedMetadata={onReady}
        onLoadedData={onReady}
        onCanPlay={onReady}
        onTimeUpdate={reportPosition}
        onSeeking={() => updateBuffering(true)}
        onSeeked={onSeeked}
        onWaiting={() => updateBuffering(true)}
        onPlaying={() => {
          setNeedsPlay(false);
          updateBuffering(false);
        }}
        onPlay={() => dispatch(play(videoRef.current.playbackRate))}
        onPause={() => {
          // Browsers emit pause before ended; the loop handler owns that case.
          if (!videoRef.current.ended) {
            reportPosition();
            dispatch(pause());
          }
        }}
        onRateChange={() => {
          if (!videoRef.current.paused)
            dispatch(play(videoRef.current.playbackRate));
        }}
        onVolumeChange={() => onMuteChange?.(videoRef.current.muted)}
        onEnded={onEnded}
      />
      {loading && !error && !needsPlay && !selectionUnavailable && (
        <div
          role="status"
          aria-label="Loading video"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
        >
          <CircularProgress color="inherit" size={40} />
        </div>
      )}
      {(error || needsPlay || selectionUnavailable) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center"
          role={error ? "alert" : "status"}
        >
          <Typography>
            {error ||
              (selectionUnavailable
                ? "This selection has no video. Choose a later part of the drive."
                : "Tap play to start the video.")}
          </Typography>
          {!selectionUnavailable && (
            <Button
              variant="outlined"
              onClick={
                error
                  ? () => {
                      setAttempt(attempt + 1);
                      dispatch(play(lastSpeed.current));
                    }
                  : startPlayback
              }
            >
              {error ? "Retry" : "Play"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function DriveVideo(props) {
  const { currentRoute } = props;
  if (!currentRoute) return null;
  const src = api.video.getQcameraStreamUrl(
    currentRoute.fullname,
    currentRoute.share_exp,
    currentRoute.share_sig,
  );
  return (
    <RouteVideo key={`${currentRoute.fullname}:${src}`} {...props} src={src} />
  );
}

export default connect((state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekVersion: state.seekVersion,
  loop: state.loop,
}))(DriveVideo);
