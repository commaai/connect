/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { bufferVideo, observeMediaTime, pause, seek } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const OBSERVED_OFFSET_EPSILON_MS = 75;

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

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoReady = this.onVideoReady.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.seekToRouteOffset = this.seekToRouteOffset.bind(this);

    this.videoPlayer = React.createRef();
    this.lastObservedOffset = null;
    this.pendingInitialSeek = true;
    this.lastRequestedMediaTime = null;

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    const sourceChanged = this.updateVideoSource(prevProps);
    if (sourceChanged) return;

    // A timeline click or range change writes a new requested offset. A media
    // progress event also updates offset, but is marked before dispatch so it
    // can never seek the player back toward a second, synthetic clock.
    if (prevProps.offset !== this.props.offset && !this.isObservedOffset(this.props.offset)) {
      this.seekToRouteOffset(this.requestedRouteOffset());
    }

    if (prevProps.currentRoute?.videoStartOffset !== this.props.currentRoute?.videoStartOffset
      && this.pendingInitialSeek) {
      this.seekToRouteOffset(this.requestedRouteOffset());
    }
  }

  componentWillUnmount() {
    this.lastObservedOffset = null;
  }

  isObservedOffset(offset) {
    return Number.isFinite(offset)
      && Number.isFinite(this.lastObservedOffset)
      && Math.abs(offset - this.lastObservedOffset) <= OBSERVED_OFFSET_EPSILON_MS;
  }

  requestedRouteOffset() {
    const { offset, loop } = this.props;
    if (Number.isFinite(offset)) return offset;
    return loop?.startTime || 0;
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.pendingInitialSeek = true;
        this.lastObservedOffset = null;
        this.setState({ src: '', videoError: null });
      }
      return false;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.pendingInitialSeek = true;
      this.lastObservedOffset = null;
      this.lastRequestedMediaTime = null;
      this.setState({ src, videoError: null });
      return true;
    }
    return false;
  }

  currentVideoTime(offset = this.requestedRouteOffset()) {
    const { currentRoute } = this.props;
    if (!currentRoute) return 0;
    const routeOffset = Math.max(0, offset - (currentRoute.videoStartOffset || 0));
    return routeOffset / 1000;
  }

  routeOffsetForMediaTime(seconds) {
    const { currentRoute } = this.props;
    if (!currentRoute || !Number.isFinite(seconds)) return null;
    return Math.max(0, Math.round((seconds * 1000) + (currentRoute.videoStartOffset || 0)));
  }

  seekToRouteOffset(offset) {
    const player = this.videoPlayer.current;
    if (!player || !Number.isFinite(offset)) return false;

    const mediaTime = this.currentVideoTime(offset);
    if (!Number.isFinite(mediaTime)) return false;
    if (this.lastRequestedMediaTime !== null && Math.abs(this.lastRequestedMediaTime - mediaTime) < 0.01) {
      return false;
    }

    this.lastRequestedMediaTime = mediaTime;
    player.seekTo(mediaTime, 'seconds');
    this.pendingInitialSeek = false;
    return true;
  }

  onVideoReady(player) {
    this.seekToRouteOffset(this.requestedRouteOffset());

    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) return;
    if (isIos()) {
      const videoElement = player.getInternalPlayer();
      onAudioStatusChange(Boolean(videoElement?.audioTracks?.length));
      return;
    }

    const hlsPlayer = player.getInternalPlayer('hls');
    if (hlsPlayer) {
      hlsPlayer.on('hlsBufferCodecs', (_event, data) => onAudioStatusChange(Boolean(data.audio)));
    }
  }

  onVideoProgress(progress) {
    const routeOffset = this.routeOffsetForMediaTime(progress.playedSeconds);
    if (!Number.isFinite(routeOffset)) return;

    const { loop, dispatch } = this.props;
    if (loop?.startTime !== null && loop?.startTime !== undefined && loop.duration > 0
      && routeOffset >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
      this.lastRequestedMediaTime = null;
      this.seekToRouteOffset(loop.startTime);
      return;
    }

    if (!this.isObservedOffset(routeOffset)) {
      this.lastObservedOffset = routeOffset;
      this.lastRequestedMediaTime = null;
      dispatch(observeMediaTime(routeOffset));
    }
  }

  onVideoBuffering() {
    if (!this.props.isBufferingVideo) this.props.dispatch(bufferVideo(true));
  }

  onVideoResume() {
    const { dispatch } = this.props;
    if (this.state.videoError) this.setState({ videoError: null });
    if (this.props.isBufferingVideo) dispatch(bufferVideo(false));
  }

  /** @param {Error} error */
  onVideoError(error, data) {
    if (!error) {
      console.warn('Unknown video error', { error, data });
      return;
    }
    if (error.name === 'AbortError') return;

    const mediaError = error === 'hlsError' ? data : error;

    // HLS buffer stalls are recoverable. The media element will emit playing
    // or canplay again when recovery succeeds, so do not convert them into a
    // false fatal error.
    if (mediaError?.type === 'mediaError' && ['bufferStalledError', 'bufferNudgeOnStall'].includes(mediaError.details)) {
      this.onVideoBuffering();
      return;
    }

    this.props.dispatch(bufferVideo(true));
    if (mediaError?.type === 'networkError') {
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }
    const videoError = mediaError?.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (mediaError?.response?.text || 'Unable to load video');
    this.setState({ videoError });
  }

  onVideoEnded() {
    const { loop, dispatch } = this.props;
    if (loop?.startTime !== null && loop?.startTime !== undefined && loop.duration > 0) {
      dispatch(seek(loop.startTime));
      this.lastRequestedMediaTime = null;
      this.seekToRouteOffset(loop.startTime);
      return;
    }
    dispatch(pause());
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
          playbackRate={desiredPlaySpeed || 1}
          progressInterval={100}
          onReady={this.onVideoReady}
          onProgress={this.onVideoProgress}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onPlay={this.onVideoResume}
          onError={this.onVideoError}
          onEnded={this.onVideoEnded}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40 },
          }}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
