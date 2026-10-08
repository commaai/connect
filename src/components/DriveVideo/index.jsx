/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { registerVideoClock, clearVideoClock } from '../../timeline/playerClock';
import { seek, videoTime, play, bufferVideo } from '../../timeline/playback';

// How often the authoritative position is mirrored into redux. The live
// position for smooth animation comes from the registered player clock on every
// animation frame; redux only needs occasional updates so non-animated readers
// (segment number in menus, upload range math) stay fresh.
const REDUX_SYNC_INTERVAL_MS = 250;

// browsers cap playbackRate; keep within a widely supported range.
const MAX_PLAYBACK_RATE = 16;

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
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

/**
 * DriveVideo — event-driven HLS player.
 *
 * The <video> element is the source of truth. We push *intent* (seek target,
 * play speed) into the element only when it changes, and we read the element's
 * native events back into redux. There is no reconciliation interval, no
 * debounce, and no playbackRate nudging — the behaviours responsible for the
 * unreliable loading, slow seeking and iOS/Firefox audio glitches in #769.
 */
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.videoPlayer = React.createRef();

    this.getVideoClock = this.getVideoClock.bind(this);
    this.onStart = this.onStart.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onCanPlay = this.onCanPlay.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onSeeked = this.onSeeked.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onPlayerReady = this.onPlayerReady.bind(this);

    // the seek token (props.startTime) of the last jump we applied to the
    // element. Lets us detect a new user seek without a reconciliation loop.
    this.appliedSeekToken = null;
    this.appliedPlaySpeed = null;
    this.lastReduxSync = 0;

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    registerVideoClock(this.getVideoClock);
    this.updateVideoSource({});
    // apply initial intent once the element exists
    this.applySpeed();
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.applySeek();
    this.applySpeed();
  }

  componentWillUnmount() {
    clearVideoClock(this.getVideoClock);
  }

  /**
   * Live playback position in route-relative ms, read straight off the element.
   * Registered with the player clock so currentOffset() animates smoothly.
   *
   * @returns {number | null}
   */
  getVideoClock() {
    const player = this.videoPlayer.current;
    const { currentRoute } = this.props;
    if (!player || !currentRoute) {
      return null;
    }
    const time = player.getCurrentTime();
    if (time === null || time === undefined || Number.isNaN(time)) {
      return null;
    }
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    return time * 1000 + videoStartOffset;
  }

  /** route-relative ms -> element seconds (clamped at 0) */
  offsetToVideoSeconds(offset) {
    const { currentRoute } = this.props;
    const videoStartOffset = currentRoute?.videoStartOffset || 0;
    return Math.max(0, (offset - videoStartOffset) / 1000);
  }

  internalPlayer() {
    const player = this.videoPlayer.current;
    return player ? player.getInternalPlayer() : null;
  }

  // --- intent -> element ---------------------------------------------------

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    const routeChanged = !prevProps.currentRoute || prevProps.currentRoute.fullname !== currentRoute.fullname;
    if (src === '' || routeChanged) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      // a new source resets what we've applied to the (new) element
      this.appliedSeekToken = null;
      this.appliedPlaySpeed = null;
      this.setState({ src, videoError: null });
    }
  }

  // seek the element only when a new user-initiated jump arrives (the seek
  // token changes). Normal playback advance is owned entirely by the element —
  // there is no corrective/catch-up seeking, which is what made the old
  // architecture fight HLS buffering and seek slowly.
  applySeek() {
    const player = this.videoPlayer.current;
    const { startTime, offset } = this.props;
    if (!player || offset === null || offset === undefined) {
      return;
    }

    if (startTime !== this.appliedSeekToken) {
      this.appliedSeekToken = startTime;
      player.seekTo(this.offsetToVideoSeconds(offset), 'seconds');
    }
  }

  // set playbackRate / play / pause once per intent change.
  applySpeed() {
    const internal = this.internalPlayer();
    const { desiredPlaySpeed } = this.props;
    if (!internal) {
      return;
    }

    if (this.appliedPlaySpeed === desiredPlaySpeed) {
      // still make sure a paused element stays paused and a playing one playing
      this.reconcilePlayState(internal, desiredPlaySpeed);
      return;
    }
    this.appliedPlaySpeed = desiredPlaySpeed;

    if (desiredPlaySpeed > 0) {
      const rate = Math.min(MAX_PLAYBACK_RATE, desiredPlaySpeed);
      if (internal.playbackRate !== rate) {
        internal.playbackRate = rate;
      }
    }
    this.reconcilePlayState(internal, desiredPlaySpeed);
  }

  reconcilePlayState(internal, desiredPlaySpeed) {
    const { isBufferingVideo } = this.props;
    const shouldPlay = desiredPlaySpeed > 0 && !isBufferingVideo;
    if (shouldPlay && internal.paused) {
      const res = internal.play?.();
      if (res && typeof res.catch === 'function') {
        res.catch(() => { /* play() interrupted by a pause/seek — safe to ignore */ });
      }
    } else if (!shouldPlay && !internal.paused && desiredPlaySpeed === 0) {
      internal.pause?.();
    }
  }

  // --- element -> state ----------------------------------------------------

  onStart() {
    // first playback: ensure the element starts at the desired position and
    // respects the current play/pause + speed intent
    this.applySeek();
    this.applySpeed();
  }

  onPlayerReady(player) {
    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) {
      return;
    }
    const videoElement = player.getInternalPlayer();
    const hlsPlayer = player.getInternalPlayer('hls');
    if (hlsPlayer) {
      // non-iOS: inspect tracks before hls.js rewrites them
      hlsPlayer.on('hlsBufferCodecs', (_event, data) => onAudioStatusChange(!!data.audio));
    } else if (videoElement?.audioTracks && videoElement.audioTracks.length > 0) {
      // iOS plays the m3u8 natively and exposes audioTracks directly
      onAudioStatusChange(true);
    }
  }

  onWaiting() {
    const { dispatch, isBufferingVideo } = this.props;
    if (!isBufferingVideo) {
      dispatch(bufferVideo(true));
    }
  }

  onPlaying() {
    const { dispatch, isBufferingVideo } = this.props;
    if (isBufferingVideo) {
      dispatch(bufferVideo(false));
    }
    if (this.state.videoError) {
      this.setState({ videoError: null });
    }
  }

  onCanPlay() {
    // enough data is buffered to show frames — clear the loading overlay even
    // when paused (onPlaying only fires once playback actually starts).
    const { dispatch, isBufferingVideo } = this.props;
    if (isBufferingVideo) {
      dispatch(bufferVideo(false));
    }
  }

  onTimeUpdate() {
    const now = Date.now();
    if (now - this.lastReduxSync < REDUX_SYNC_INTERVAL_MS) {
      return;
    }
    this.lastReduxSync = now;
    const live = this.getVideoClock();
    if (live !== null) {
      // mirror the authoritative position into redux without bumping the seek
      // token (so the map doesn't re-center every frame).
      this.props.dispatch(videoTime(live));
    }
  }

  onSeeked() {
    const { dispatch, isBufferingVideo } = this.props;
    const internal = this.internalPlayer();
    // after a seek completes, sync redux immediately and clear buffering if the
    // element is actually ready to show frames.
    const live = this.getVideoClock();
    if (live !== null) {
      dispatch(videoTime(live));
    }
    if (isBufferingVideo && internal && internal.readyState >= 3) {
      dispatch(bufferVideo(false));
    }
  }

  onEnded() {
    const { dispatch, loop } = this.props;
    if (loop?.startTime) {
      // respect the active loop: jump back to its start
      dispatch(seek(loop.startTime));
    } else {
      dispatch(play(0));
    }
  }

  onHlsError(e) {
    const { dispatch } = this.props;

    if (e?.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // transient stall — surface buffering, not an error
      dispatch(bufferVideo(true));
      return;
    }

    if (e?.type === 'networkError' && e.response?.code === 404) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
  }

  onVideoError(e, data) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }

    if (e.name === 'AbortError') {
      return; // benign: a pending play() was interrupted by a seek/pause
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }

    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
    this.setState({ videoError });
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={this.onPlayerReady}
          onStart={this.onStart}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
            attributes: {
              onWaiting: this.onWaiting,
              onPlaying: this.onPlaying,
              onCanPlay: this.onCanPlay,
              onTimeUpdate: this.onTimeUpdate,
              onSeeked: this.onSeeked,
            },
          }}
          playbackRate={Math.min(MAX_PLAYBACK_RATE, Math.max(0, desiredPlaySpeed) || 1)}
          onEnded={this.onEnded}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  startTime: state.startTime,
  isBufferingVideo: state.isBufferingVideo,
  loop: state.loop,
  routes: state.routes,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
