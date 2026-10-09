/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import Hls from 'hls.js';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline, Pause, PlayArrow } from '../../icons';
import { currentOffset, seek as setOffset } from '../../timeline';
import { bufferVideo, pause, play, setPlaying } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

// The video element owns the playback position. Every frame its currentTime is
// published to the playback clock (see src/timeline/index.js) and the timeline
// scrubber, map marker and time display follow it. User seeks write to the
// clock and this component drags the video to it, like any regular player.
const SEEK_TOLERANCE_MS = 300; // clock drift before the video is moved to it
const WRAP_EARLY_MS = 40; // wrap loops slightly early so the next frame never shows
const MAX_PLAYBACK_RATE = 16;
const FRAGMENT_RETRIES = 3;
const RESUME_CHECK_MS = 2000; // how often a paused-but-should-play video is nudged

const clampPlaybackRate = (speed) => Math.max(0.1, Math.min(MAX_PLAYBACK_RATE, speed));

// start playback, ignoring autoplay rejections until the next user gesture
function safePlay(video) {
  const result = video.play();
  if (result && typeof result.catch === 'function') {
    result.catch(() => {});
  }
  return result;
}

function VideoOverlay({ loading, error, onRetry }) {
  if (!error && !loading) {
    return null;
  }
  return (
    <div className="animate-fadein absolute inset-0 z-10 flex items-center justify-center bg-[#16181A]/80">
      {error ? (
        <div className="flex flex-col items-center px-6 text-center">
          <ErrorOutline className="mb-3 h-10 w-10 text-white/90" />
          <Typography color="inherit" style={{ fontSize: 14 }}>{error}</Typography>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 cursor-pointer rounded-full bg-white/10 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
      )}
    </div>
  );
}

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.videoRef = React.createRef();

    this.setupSource = this.setupSource.bind(this);
    this.applyPlayIntent = this.applyPlayIntent.bind(this);
    this.frame = this.frame.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onCanPlay = this.onCanPlay.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onPause = this.onPauseEvt.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onBufferCodecs = this.onBufferCodecs.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.retry = this.retry.bind(this);

    this.state = {
      videoError: null,
      pulse: null, // { id, playing } rendered as a brief play/pause flash
    };

    this.hls = null;
    this.rafId = null;
    this.hasMetadata = false;
    this.lastSpeed = 1;
    this.fragmentRetries = 0;
    this.mediaErrorRetries = 0;
    this.lastResumeCheck = 0;
  }

  componentDidMount() {
    const video = this.videoRef.current;
    if (video) {
      video.muted = this.props.isMuted;
    }
    this.setupSource();
    this.applyPlayIntent();
    this.rafId = requestAnimationFrame(this.frame);
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, desiredPlaySpeed, isMuted } = this.props;
    const video = this.videoRef.current;

    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      this.hasMetadata = false;
      this.fragmentRetries = 0;
      this.mediaErrorRetries = 0;
      this.setState({ videoError: null });
      this.setupSource();
    }

    if (!video) {
      return;
    }

    if (prevProps.isMuted !== isMuted) {
      video.muted = isMuted;
    }

    if (desiredPlaySpeed > 0) {
      this.lastSpeed = desiredPlaySpeed;
    }

    if (prevProps.desiredPlaySpeed !== desiredPlaySpeed) {
      this.applyPlayIntent();
    }
  }

  componentWillUnmount() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    // no video element exists to keep playing, so stop saying that we are
    const { dispatch, isPlaying } = this.props;
    if (isPlaying) {
      dispatch(pause());
      dispatch(setPlaying(false));
    }
  }

  loopBounds() {
    const { loop } = this.props;
    if (!loop) {
      return null;
    }
    return [loop.startTime, loop.startTime + loop.duration];
  }

  clampToLoop(offset) {
    const bounds = this.loopBounds();
    if (!bounds) {
      return Math.max(0, offset);
    }
    return Math.min(Math.max(offset, bounds[0]), bounds[1]);
  }

  toVideoTime(routeOffsetMs) {
    const { currentRoute } = this.props;
    const video = this.videoRef.current;
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    let seconds = (routeOffsetMs - videoStartOffset) / 1000;
    seconds = Math.max(0, seconds);
    if (video && Number.isFinite(video.duration)) {
      seconds = Math.min(seconds, video.duration);
    }
    return seconds;
  }

  toRouteMs(videoSeconds) {
    const { currentRoute } = this.props;
    return (videoSeconds * 1000) + (currentRoute.videoStartOffset || 0);
  }

  setupSource() {
    const { currentRoute } = this.props;
    const video = this.videoRef.current;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (!video) {
      return;
    }

    if (!currentRoute) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

    if (!isIos() && Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 40,
        backBufferLength: 90,
        lowLatencyMode: false,
      });
      this.hls = hls;
      hls.on(Hls.Events.ERROR, this.onHlsError);
      hls.on(Hls.Events.BUFFER_CODECS, this.onBufferCodecs);
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      // iPhone has no MSE so it plays the stream natively
      video.src = src;
    }
  }

  applyPlayIntent() {
    const { desiredPlaySpeed } = this.props;
    const video = this.videoRef.current;
    if (!video || this.state.videoError) {
      return;
    }
    if (desiredPlaySpeed > 0) {
      video.playbackRate = clampPlaybackRate(desiredPlaySpeed);
      if (video.paused) {
        safePlay(video);
      }
    } else {
      video.pause();
    }
  }

  frame() {
    this.rafId = requestAnimationFrame(this.frame);
    const video = this.videoRef.current;
    const { currentRoute, desiredPlaySpeed } = this.props;
    if (!video || !currentRoute) {
      return;
    }

    // browsers pause media in background tabs and never resume it themselves
    if (desiredPlaySpeed > 0 && video.paused && !video.ended && !video.seeking
      && !this.state.videoError && Date.now() - this.lastResumeCheck > RESUME_CHECK_MS) {
      this.lastResumeCheck = Date.now();
      safePlay(video);
    }

    if (!this.hasMetadata) {
      // until the stream has loaded, hold the clock where playback will start
      setOffset(this.clampToLoop(currentOffset()));
      return;
    }

    // move the video to wherever the clock was seeked to
    const targetMs = this.clampToLoop(currentOffset());
    if (targetMs !== currentOffset()) {
      setOffset(targetMs);
    }
    if (Math.abs(targetMs - this.toRouteMs(video.currentTime)) > SEEK_TOLERANCE_MS) {
      video.currentTime = this.toVideoTime(targetMs);
    }

    // loop playback while it is running
    const bounds = this.loopBounds();
    if (bounds && !video.paused && this.toRouteMs(video.currentTime) >= bounds[1] - WRAP_EARLY_MS) {
      this.wrapToLoopStart();
    }

    // the video position is the truth everything else follows
    setOffset(this.toRouteMs(video.currentTime));
  }

  wrapToLoopStart() {
    const video = this.videoRef.current;
    const bounds = this.loopBounds();
    if (!video || !bounds) {
      return false;
    }
    const loopStart = this.toVideoTime(bounds[0]);
    if (Number.isFinite(video.duration) && loopStart >= video.duration - 0.1) {
      // the loop starts past the end of the video, nothing to loop over
      video.pause();
      this.props.dispatch(pause());
      return false;
    }
    video.currentTime = loopStart;
    // the clock must follow immediately or the next frame would undo the wrap
    setOffset(this.toRouteMs(video.currentTime));
    return true;
  }

  setVideoError(message) {
    this.setState({ videoError: message });
    this.props.dispatch(bufferVideo(false));
    this.props.dispatch(setPlaying(false));
    this.videoRef.current?.pause();
  }

  onLoadedMetadata() {
    this.hasMetadata = true;
    const { desiredPlaySpeed, onAudioStatusChange } = this.props;
    const video = this.videoRef.current;
    if (!video) {
      return;
    }

    video.playbackRate = clampPlaybackRate(desiredPlaySpeed || this.lastSpeed);

    // start where the timeline expects, not at zero; the frame loop has
    // already moved the clock into the selection
    video.currentTime = this.toVideoTime(this.clampToLoop(currentOffset()));

    if (desiredPlaySpeed > 0) {
      safePlay(video);
    }

    // native HLS (iOS) only exposes its tracks through the video element
    if (onAudioStatusChange && video.audioTracks && video.audioTracks.length > 0) {
      onAudioStatusChange(true);
    }
  }

  onCanPlay() {
    this.fragmentRetries = 0;
    this.mediaErrorRetries = 0;
    this.props.dispatch(bufferVideo(false));
  }

  onPlaying() {
    this.fragmentRetries = 0;
    this.mediaErrorRetries = 0;
    this.props.dispatch(bufferVideo(false));
    this.props.dispatch(setPlaying(true));
  }

  onWaiting() {
    this.props.dispatch(bufferVideo(true));
  }

  onPauseEvt() {
    this.props.dispatch(setPlaying(false));
  }

  onEnded() {
    if (this.wrapToLoopStart() && this.videoRef.current) {
      safePlay(this.videoRef.current);
    } else {
      this.props.dispatch(pause());
    }
  }

  onVideoError(ev) {
    const mediaError = ev.currentTarget.error;
    if (!mediaError || mediaError.code === 1) { // 1 = MEDIA_ERR_ABORTED
      return;
    }
    const messages = {
      2: 'Unable to load video. Check network connection.', // MEDIA_ERR_NETWORK
      3: 'Unable to play this video.', // MEDIA_ERR_DECODE
      4: 'This video has not been uploaded yet or has been deleted.', // MEDIA_ERR_SRC_NOT_SUPPORTED
    };
    this.setVideoError(messages[mediaError.code] || 'Unable to load video.');
  }

  onHlsError(_event, data) {
    if (!this.hls) {
      return;
    }
    if (!data.fatal) {
      return; // hls.js recovers from non-fatal errors by itself
    }

    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      const manifestError = data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR
        || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
        || data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR
        || data.details === Hls.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR;
      if (manifestError) {
        this.setVideoError(data.response?.code === 404
          ? 'This video has not been uploaded yet or has been deleted.'
          : 'Unable to load video.');
        return;
      }
      // fragment or playlist failures can be retried without stopping playback
      if (this.fragmentRetries < FRAGMENT_RETRIES) {
        this.fragmentRetries += 1;
        this.hls.startLoad();
        return;
      }
      this.setVideoError('Unable to load video. Check network connection.');
      return;
    }

    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      if (this.mediaErrorRetries < 2) {
        this.mediaErrorRetries += 1;
        this.hls.recoverMediaError();
        return;
      }
      this.setVideoError('Unable to play this video.');
      return;
    }

    this.setVideoError('Unable to play this video.');
  }

  onBufferCodecs(_event, data) {
    const { onAudioStatusChange } = this.props;
    if (onAudioStatusChange) {
      onAudioStatusChange(Boolean(data.audio || data.audiovideo));
    }
  }

  handleClick() {
    const { desiredPlaySpeed, dispatch, isPlaying } = this.props;
    if (this.state.videoError) {
      return;
    }
    if (isPlaying) {
      dispatch(pause());
      this.setState({ pulse: { id: Date.now(), playing: false } });
    } else {
      // resume at the speed playback last ran at
      const speed = desiredPlaySpeed > 0 ? desiredPlaySpeed : (this.lastSpeed || 1);
      dispatch(play(speed));
      // this click is the user gesture that unblocks autoplay, so start now
      // instead of waiting for the intent to reach this component as a prop
      const video = this.videoRef.current;
      if (video && !this.state.videoError) {
        video.playbackRate = clampPlaybackRate(speed);
        safePlay(video);
      }
      this.setState({ pulse: { id: Date.now(), playing: true } });
    }
  }

  handleKeyDown(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) {
      return;
    }
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ev.target?.isContentEditable) {
      return;
    }

    const offset = currentOffset();
    switch (ev.key) {
      case ' ':
      case 'k':
      case 'K':
      case 'Enter':
        ev.preventDefault();
        this.handleClick();
        break;
      case 'j':
      case 'J':
        ev.preventDefault();
        setOffset(offset - 10000, this.props.dispatch);
        break;
      case 'l':
      case 'L':
        ev.preventDefault();
        setOffset(offset + 10000, this.props.dispatch);
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        setOffset(offset - 5000, this.props.dispatch);
        break;
      case 'ArrowRight':
        ev.preventDefault();
        setOffset(offset + 5000, this.props.dispatch);
        break;
      default:
        break;
    }
  }

  retry() {
    this.fragmentRetries = 0;
    this.mediaErrorRetries = 0;
    this.hasMetadata = false;
    this.setState({ videoError: null });
    this.props.dispatch(bufferVideo(true));
    this.setupSource();
  }

  render() {
    const { isBufferingVideo, isMuted, isPlaying } = this.props;
    const { videoError, pulse } = this.state;

    return (
      <div
        className="relative m-[0_auto] aspect-[1.593] max-w-[964px] min-h-[200px] cursor-pointer bg-black outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        role="button"
        tabIndex={0}
        aria-label={isPlaying ? 'Pause route video' : 'Play route video'}
        onClick={this.handleClick}
        onKeyDown={this.handleKeyDown}
      >
        <video
          ref={this.videoRef}
          className="h-full w-full object-contain"
          playsInline
          muted={isMuted}
          onLoadedMetadata={this.onLoadedMetadata}
          onCanPlay={this.onCanPlay}
          onPlaying={this.onPlaying}
          onWaiting={this.onWaiting}
          onPause={this.onPause}
          onEnded={this.onEnded}
          onError={this.onVideoError}
        />
        <VideoOverlay loading={isBufferingVideo && !videoError} error={videoError} onRetry={this.retry} />
        {pulse && (
          <div
            key={pulse.id}
            className="animate-video-pulse pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            onAnimationEnd={() => this.setState({ pulse: null })}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-black/60">
              {pulse.playing
                ? <PlayArrow className="h-12 w-12 text-white" />
                : <Pause className="h-10 w-10 text-white" />}
            </div>
          </div>
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  isPlaying: state.isPlaying,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
