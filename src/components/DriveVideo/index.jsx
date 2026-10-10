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
    <div className="relative m-auto aspect-[1.593] min-h-[200px] max-w-[964px] overflow-hidden rounded-lg bg-black">
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

const getVideoState = (videoPlayer) => {
  const currentTime = videoPlayer.getCurrentTime();
  const { buffered } = videoPlayer.getInternalPlayer();

  let bufferRemaining = -1;
  for (let i = 0; i < buffered.length; i++) {
    const end = buffered.end(i);
    if (currentTime >= buffered.start(i) && currentTime <= end) {
      bufferRemaining = end - currentTime;
      break;
    }
  }

  return {
    bufferRemaining,
    hasLoaded: bufferRemaining > 0,
  };
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.syncVideo = debounceLeading(this.syncVideo.bind(this), 200);
    this.firstSeek = true;

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.updateVideoSource({});
    this.syncVideo();
    this.videoSyncIntv = setInterval(this.syncVideo, 500);
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
  }

  componentWillUnmount() {
    if (this.videoSyncIntv) {
      clearTimeout(this.videoSyncIntv);
      this.videoSyncIntv = null;
    }
  }

  onVideoBuffering() {
    const { dispatch, currentRoute } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !currentRoute || !videoPlayer.getDuration()) {
      dispatch(bufferVideo(true));
    }

    if (this.firstSeek) {
      this.firstSeek = false;
      videoPlayer.seekTo(this.currentVideoTime(), "seconds");
    }

    const { hasLoaded } = getVideoState(videoPlayer);
    const { readyState } = videoPlayer.getInternalPlayer();
    if (!hasLoaded || readyState < 2) {
      dispatch(bufferVideo(true));
    }
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (
      e.type === "mediaError" &&
      (e.details === "bufferStalledError" || e.details === "bufferNudgeOnStall")
    ) {
      // buffer but no error
      return;
    }

    if (e.type === "networkError" && e.response?.code === 404) {
      this.setState({
        videoError:
          "This video segment has not uploaded yet or has been deleted.",
      });
    } else {
      this.setState({ videoError: "Unable to load video" });
    }
  }

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    if (!e) {
      console.warn("Unknown video error", { e, data });
      return;
    }

    if (e === "hlsError") {
      this.onHlsError(data);
      return;
    }

    if (e.name === "AbortError") {
      // ignore
      return;
    }

    if (
      e.target?.src?.startsWith(window.location.origin) &&
      e.target.src.endsWith("undefined")
    ) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn("Video error with undefined src, ignoring", { e, data });
      return;
    }

    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === "networkError") {
      console.error("Network error", { e, data });
      this.setState({
        videoError: "Unable to load video. Check network connection.",
      });
      return;
    }

    const videoError =
      e.response?.code === 404
        ? "This video segment has not uploaded yet or has been deleted."
        : e.response?.text || "Unable to load video";
    this.setState({ videoError });
  }

  onVideoResume() {
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== "") {
        this.setState({ src: "", videoError: null });
      }
      return;
    }

    if (
      src === "" ||
      !prevProps.currentRoute ||
      prevProps.currentRoute?.fullname !== currentRoute.fullname
    ) {
      src = api.video.getQcameraStreamUrl(
        currentRoute.fullname,
        currentRoute.share_exp,
        currentRoute.share_sig,
      );
      this.setState({ src, videoError: null });
      this.syncVideo();
    }
  }

  syncVideo() {
    const { dispatch, isBufferingVideo, isMuted } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (
      !videoPlayer ||
      !videoPlayer.getInternalPlayer() ||
      !videoPlayer.getDuration()
    ) {
      return;
    }

    let { desiredPlaySpeed: newPlaybackRate } = this.props;
    const desiredVideoTime = this.currentVideoTime();
    const curVideoTime = videoPlayer.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;

    if (Math.abs(timeDiff) <= Math.max(0.1, 0.5 * newPlaybackRate)) {
      // newPlaybackRate = 0 when paused, set minimum 0.1 to prevent seeking when paused
      if (!isIos()) {
        newPlaybackRate = Math.max(
          0,
          newPlaybackRate + Math.round(timeDiff * 10) / 10,
        );
      }
    } else if (
      desiredVideoTime === 0 &&
      timeDiff < 0 &&
      curVideoTime !== videoPlayer.getDuration()
    ) {
      // logs start earlier than video, so skip to video ts 0
      dispatch(seek(currentOffset() - timeDiff * 1000));
    } else {
      videoPlayer.seekTo(desiredVideoTime, "seconds");
    }
    // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x causing audio to cut in and out with timeDiff rate shifts
    newPlaybackRate = Math.max(
      0,
      Math.min(isFirefox() && !isMuted ? 8 : 16, newPlaybackRate),
    );

    const internalPlayer = videoPlayer.getInternalPlayer();

    const { hasLoaded } = getVideoState(videoPlayer);
    if (isBufferingVideo && internalPlayer.readyState >= 4) {
      dispatch(bufferVideo(false));
    } else if (
      isBufferingVideo ||
      !hasLoaded ||
      internalPlayer.readyState < 2
    ) {
      if (!isBufferingVideo) {
        dispatch(bufferVideo(true));
      }
      newPlaybackRate = 0; // in some circumstances, iOS won't update readyState unless temporarily paused
    }

    if (videoPlayer.getInternalPlayer("hls")) {
      if (!internalPlayer.paused && newPlaybackRate === 0) {
        internalPlayer.pause();
      } else if (
        internalPlayer.playbackRate !== newPlaybackRate &&
        newPlaybackRate !== 0
      ) {
        internalPlayer.playbackRate = newPlaybackRate;
      }
      if (internalPlayer.paused && newPlaybackRate !== 0) {
        const playRes = internalPlayer.play();
        if (playRes) {
          playRes.catch(() =>
            console.debug("[DriveVideo] play interrupted by pause"),
          );
        }
      }
    } else {
      // TODO: fix iOS bug where video doesn't stop buffering while paused
      internalPlayer.playbackRate = newPlaybackRate;
    }
  }

  currentVideoTime(offset = currentOffset()) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      return 0;
    }

    if (currentRoute.videoStartOffset) {
      offset -= currentRoute.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  render() {
    const {
      desiredPlaySpeed,
      isBufferingVideo,
      currentRoute,
      onAudioStatusChange,
      isMuted,
    } = this.props;
    const { src, videoError } = this.state;

    const onPlayerReady = (player) => {
      if (isIos()) {
        // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
        const videoElement = player.getInternalPlayer();
        if (
          videoElement &&
          videoElement.audioTracks &&
          videoElement.audioTracks.length > 0
        ) {
          if (onAudioStatusChange) {
            onAudioStatusChange(true);
          }
        }
      } else {
        // on other platforms, inspect audio tracks before hls.js changes things
        const hlsPlayer = player.getInternalPlayer("hls");
        if (hlsPlayer) {
          hlsPlayer.on("hlsBufferCodecs", (event, data) => {
            if (onAudioStatusChange) {
              onAudioStatusChange(!!data.audio);
            }
          });
        }
      }
    };

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={onPlayerReady}
          config={{
            hlsVersion: "1.4.8",
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onPlay={this.onVideoResume}
          onError={this.onVideoError}
        />
      </div>
    );
  }
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
