/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, IconButton, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, Fullscreen, RefreshIcon } from '../../icons';
import { isIos } from '../../utils/browser';
import {
  setPlaybackSpeed, resetPlayback, play, pause, seek, videoProgress, setHasAudio, setVideoStatus, VideoStatus,
} from '../../timeline/playback';

const EXPIRED = 'This link has expired';
const OFFLINE = 'You\'re offline';
const GAP_SECONDS = 5;

const VideoOverlay = ({ loading, error, onRetry, onSkip, skipAt, skipTarget }) => (error || loading) && (
  <div className={`z-50 absolute h-full w-full bg-[#16181AAA] ${error ? '' : 'animate-[fadein_0.25s_0.4s_both]'}`}>
    <div className="flex h-full flex-col items-center justify-center px-4 text-center">
      {error ? <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        {skipAt != null && <Typography>Skipping in {Math.max(0, Math.ceil((skipAt - Date.now()) / 1000))}…</Typography>}
        <div className="flex gap-2">
          {error !== EXPIRED && <Button className="mt-3 rounded-3xl bg-white/10 px-6 py-1.5 text-sm font-medium normal-case text-white hover:bg-white/20"
            onClick={onRetry} disableRipple><RefreshIcon className="mr-2" style={{ fontSize: 20 }} />Retry</Button>}
          {skipTarget != null && <Button className="mt-3 rounded-3xl bg-white/10 px-6 py-1.5 text-sm font-medium normal-case text-white hover:bg-white/20"
            onClick={onSkip} disableRipple>Skip now</Button>}
        </div>
      </> : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
    </div>
  </div>
);

class RouteVideo extends Component {
  player = React.createRef();
  ready = false;
  retryGap = null;
  state = { videoError: null, attempt: 0, canFullscreen: false, skipAt: null };

  componentDidMount() {
    this.props.dispatch(resetPlayback());
    window.addEventListener('online', this.onOnline);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, loop, offset, currentRoute } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.seekTo(seekRequest.offset, seekRequest);
    } else if (loop !== prevProps.loop) {
      this.seekTo(offset);
    } else if ((currentRoute.videoStartOffset || 0)
      !== (prevProps.currentRoute.videoStartOffset || 0)) {
      if (this.seekBeforeVideoStart) this.seekTo(offset);
      else if (this.ready) this.updateOffset(this.player.current.getInternalPlayer());
      this.seekBeforeVideoStart = false;
    } else if (currentRoute.duration !== prevProps.currentRoute.duration && this.failure) this.onBuffer();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
    this.audioTracks?.removeEventListener('addtrack', this.onAddTrack);
  }

  seekTo = (offset, seekRequest) => {
    if (seekRequest) this.retryGap = null;
    this.cancelSkip();
    if (!this.ready) return; // onReady applies the latest request after loading.
    const { currentRoute, loop } = this.props;
    const start = loop?.startTime ?? 0;
    const end = loop ? start + loop.duration : currentRoute.duration;
    const clamped = Math.max(start, Math.min(offset, end));
    if (currentRoute.videoStartOffset == null && clamped > 0) this.seekBeforeVideoStart = true;
    const seconds = Math.max(0, (clamped - (currentRoute.videoStartOffset || 0)) / 1000);
    this.player.current.seekTo(seconds, 'seconds');
    if (seekRequest) this.props.dispatch(setVideoStatus(this.props.videoStatus, seekRequest));
  };

  onReady = (player) => {
    if (this.ready) return;
    this.ready = true;
    this.seekTo(this.props.offset, this.props.seekRequest);
    const video = player.getInternalPlayer();
    this.clearRecoveredGap(video);
    video.addEventListener('webkitendfullscreen', this.onWebkitEndFullscreen);
    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => this.props.dispatch(setHasAudio(!!data.audio)));
    } else if (video.audioTracks) {
      // iOS populates audioTracks either side of canplay, so sample it and keep watching.
      this.audioTracks?.removeEventListener('addtrack', this.onAddTrack);
      this.audioTracks = video.audioTracks;
      this.audioTracks.addEventListener('addtrack', this.onAddTrack);
      this.onAddTrack();
    }
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  onAddTrack = () => this.props.dispatch(setHasAudio(this.audioTracks.length > 0));

  onAnimationFrame = () => {
    const video = this.player.current.getInternalPlayer();
    const { skipAt } = this.state;
    if (skipAt != null && navigator.onLine === false) this.onError(new Error());
    else if (skipAt != null && !this.props.isPlaying) this.cancelSkip();
    else if (skipAt != null) {
      const remaining = Math.ceil((skipAt - Date.now()) / 1000);
      if (remaining !== this.remaining) { this.remaining = remaining; this.forceUpdate(); }
      if (remaining <= 0) this.onSkip();
    }
    this.updateOffset(video);
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  updateOffset = (video) => {
    this.clearRecoveredGap(video);
    const { currentRoute, dispatch, loop, isPlaying, offset, videoStatus } = this.props;
    if (!this.ready || video.seeking || videoStatus === VideoStatus.FAILED) return;
    const nextOffset = Math.round(video.currentTime * 1000) + (currentRoute.videoStartOffset || 0);
    if (isPlaying && loop?.duration > 0 && nextOffset >= loop.startTime + loop.duration
      && loop.startTime + loop.duration > (currentRoute.videoStartOffset || 0)) {
      this.seekTo(loop.startTime);
    } else if (nextOffset !== offset) {
      dispatch(videoProgress(nextOffset));
    }
  };

  onPlayable = () => {
    const { dispatch } = this.props;
    const video = this.player.current.getInternalPlayer();
    const gapFailed = !this.clearRecoveredGap(video) && this.failureEnd != null && !this.failureIsAhead();
    if (gapFailed) this.onBuffer();
    else this.clearVideoError();
    this.setState({ canFullscreen: video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.error && video.webkitSupportsFullscreen });
    dispatch(setVideoStatus(gapFailed ? VideoStatus.FAILED : VideoStatus.READY));
  };

  onSeeking = (event) => {
    this.failure = null;
    this.failureStart = this.failureEnd = null;
    this.clearVideoError();
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
    this.player.current.getInternalPlayer('hls')?.startLoad(event.target.currentTime);
  };

  onSeeked = (event) => {
    this.onPlayable();
    this.updateOffset(event.target);
  };

  onEnded = () => {
    const { isPlaying, loop, dispatch } = this.props;
    if (isPlaying && loop?.duration > 0) {
      this.seekTo(loop.startTime);
      this.player.current.getInternalPlayer().play().catch(this.onError);
    } else {
      dispatch(pause());
    }
  };

  onError = (error, data) => {
    if (error === 'hlsError' && !data?.fatal && ![401, 403, 404].includes(data?.response?.code)) return;
    if (error === 'hlsError') error = data;
    if (!error || error.name === 'AbortError') return;
    const { currentRoute, dispatch } = this.props;
    if (error.name === 'NotAllowedError') {
      dispatch(setVideoStatus(VideoStatus.READY));
      dispatch(pause()); // Leave the play button available after blocked autoplay.
      return;
    }
    const status = error.response?.code;
    const sameGap = status === 404 && this.failureEnd != null && this.failureStart === error.frag?.start;
    if (!(sameGap)) this.cancelSkip();
    const expired = currentRoute.share_exp && Number(currentRoute.share_exp) * 1000 < Date.now();
    if (expired) this.failure = EXPIRED;
    else if (status === 404) this.failure = 'This video segment has not uploaded yet or has been deleted.';
    else if (navigator.onLine === false) this.failure = OFFLINE;
    else if (status === 401 || status === 403) this.failure = 'You don\'t have access to this video';
    else this.failure = 'Unable to load video';
    this.failureStart = error.frag?.start;
    this.failureEnd = status === 404 && !expired && Number.isFinite(error.frag?.start + error.frag?.duration)
      ? error.frag.start + error.frag.duration : null;
    if (this.state.videoError && !sameGap) this.setState({ videoError: this.failure, canFullscreen: false });
    if (!this.failureIsAhead()) this.onBuffer();
  };

  // hls.js can give up on a segment ahead of the playhead, so play what is buffered first.
  failureIsAhead = () => this.failureStart > this.player.current.getCurrentTime()
    && this.player.current.getInternalPlayer().readyState >= 3;

  onBuffer = () => {
    const { dispatch, videoStatus } = this.props;
    if (this.failure && !this.failureIsAhead()) {
      dispatch(setVideoStatus(VideoStatus.FAILED));
      const skipTarget = this.getSkipTarget();
      const skipAt = skipTarget != null && this.props.isPlaying && this.failureStart !== this.retryGap
        ? this.state.skipAt ?? Date.now() + GAP_SECONDS * 1000 : null;
      this.setState({ videoError: this.failure, canFullscreen: false, skipAt });
      if (skipTarget == null && this.failureEnd != null && Number.isFinite(this.props.currentRoute.duration)) dispatch(pause());
    } else if (videoStatus !== VideoStatus.FAILED) {
      dispatch(setVideoStatus(VideoStatus.LOADING));
    }
  };

  clearRecoveredGap = (video) => {
    if (this.failureEnd == null || video.readyState < 3) return false;
    const buffered = video.buffered;
    let recovered = video.currentTime > this.failureEnd;
    for (let i = 0; buffered && !recovered && i < buffered.length; i++) recovered = buffered.start(i) <= this.failureStart && buffered.end(i) >= this.failureEnd;
    if (!recovered) return false;
    this.failure = this.failureStart = this.failureEnd = null;
    this.clearVideoError(); this.props.dispatch(setVideoStatus(VideoStatus.READY)); return true;
  };

  getSkipTarget = () => {
    const { currentRoute, loop } = this.props;
    if (this.failureEnd == null || !Number.isFinite(currentRoute.duration)) return null;
    const target = Math.min(Math.ceil(this.failureEnd / 60) * 60 * 1000
      + (currentRoute.videoStartOffset || 0), currentRoute.duration);
    if (target >= currentRoute.duration) return null;
    if (loop?.duration > 0 && (target < loop.startTime || target >= loop.startTime + loop.duration)) {
      const gapStart = this.failureStart * 1000 + (currentRoute.videoStartOffset || 0);
      const gapEnd = this.failureEnd * 1000 + (currentRoute.videoStartOffset || 0);
      return gapStart <= loop.startTime && gapEnd >= loop.startTime + loop.duration ? null
        : gapStart <= loop.startTime && gapEnd > loop.startTime ? gapEnd : loop.startTime;
    }
    return target;
  };

  cancelSkip = () => { this.setState({ skipAt: null }); };

  clearVideoError = () => { this.cancelSkip(); this.setState({ videoError: null }); };

  onSkip = () => {
    const target = this.getSkipTarget();
    this.cancelSkip();
    this.props.dispatch(target == null ? pause() : seek(target));
  };

  onPlay = () => {
    this.clearRecoveredGap(this.player.current.getInternalPlayer());
    if (!this.props.isPlaying) this.props.dispatch(play());
  };

  onPause = () => {
    this.cancelSkip();
    const video = this.player.current.getInternalPlayer();
    const resumeVideo = this.resumeAfterFullscreen && this.props.isPlaying && video;
    this.resumeAfterFullscreen = false;
    if (resumeVideo) setTimeout(() => this.props.isPlaying
      && resumeVideo === this.player.current?.getInternalPlayer() && resumeVideo.play().catch(this.onError));
    else if (this.props.isPlaying && !video.ended) this.props.dispatch(pause());
  };

  onWebkitEndFullscreen = ({ currentTarget: video }) => {
    this.resumeAfterFullscreen = this.props.isPlaying && !video.paused;
    setTimeout(() => { this.resumeAfterFullscreen = false; }, 1000);
  };

  onRetry = () => {
    cancelAnimationFrame(this.frameId);
    this.ready = false;
    this.retryGap = this.failureStart; this.failure = null;
    this.failureStart = this.failureEnd = null;
    this.clearVideoError();
    this.setState(({ attempt }) => ({ attempt: attempt + 1, canFullscreen: false }));
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
  };

  onOnline = () => {
    if (this.failure === OFFLINE) this.onRetry();
  };

  // react-player does not forward a rejected hls.js script load.
  onUnhandledRejection = (event) => {
    if (!event.reason?.message?.includes('/hls.js@')) return;
    event.preventDefault();
    this.onError(event.reason);
  };

  onPlaybackRateChange = (rate) => {
    if (rate !== this.props.desiredPlaySpeed) this.props.dispatch(setPlaybackSpeed(rate));
  };

  config = {
    hlsVersion: '1.4.8',
    hlsOptions: { maxBufferLength: 40 },
    attributes: {
      onTimeUpdate: (event) => this.updateOffset(event.target),
      onSeeking: this.onSeeking,
      onSeeked: this.onSeeked,
      onCanPlay: this.onPlayable,
      onEmptied: () => this.setState({ canFullscreen: false }),
    },
  };

  render() {
    const { currentRoute, isPlaying, desiredPlaySpeed, videoStatus, isMuted, isFullscreen, onFullscreenToggle } = this.props;
    const { videoError, attempt, canFullscreen, skipAt } = this.state;
    return (
      <div className={`relative m-[0_auto] aspect-[1.593] ${isFullscreen ? 'w-[min(100%,140vh)]' : 'w-full max-w-[964px]'}`}>
        <VideoOverlay loading={videoStatus === VideoStatus.LOADING} error={videoError} onRetry={this.onRetry}
          onSkip={this.onSkip} skipAt={skipAt} skipTarget={this.getSkipTarget()} />
        <ReactPlayer
          key={attempt}
          ref={this.player}
          url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={isPlaying}
          playbackRate={desiredPlaySpeed}
          onReady={this.onReady}
          onBuffer={this.onBuffer}
          onBufferEnd={this.onPlayable}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onPlaybackRateChange={this.onPlaybackRateChange}
          onEnded={this.onEnded}
          onError={this.onError}
          config={this.config}
        />
        {onFullscreenToggle && (!isIos() || canFullscreen) && <IconButton className="z-[60] absolute bottom-1 right-1 h-10 w-10 bg-black/30 text-white hover:bg-black/50"
          onClick={onFullscreenToggle} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
          <Fullscreen exit={isFullscreen} />
        </IconButton>}
      </div>
    );
  }
}

const DriveVideo = (props) => props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} />
  : null;

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRequest: state.seekRequest,
  currentRoute: state.currentRoute,
  loop: state.loop,
  isPlaying: state.isPlaying,
  videoStatus: state.videoStatus,
});

export default connect(stateToProps)(DriveVideo);
