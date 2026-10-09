/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, RefreshIcon } from '../../icons';
import {
  setPlaybackSpeed, resetPlayback, play, pause, videoProgress, setHasAudio, setVideoStatus, VideoStatus,
} from '../../timeline/playback';

const getVideoStartOffset = (route) => route.videoStartOffset || 0;
const OFFLINE = 'You\'re offline';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button
          className="mt-3 rounded-3xl bg-white/10 px-6 py-1.5 text-sm font-medium normal-case text-white hover:bg-white/20"
          onClick={onRetry}
          disableRipple
        >
          <RefreshIcon className="mr-2" style={{ fontSize: 20 }} />
          Retry
        </Button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="flex h-full flex-col items-center justify-center px-4 text-center">
        {content}
      </div>
    </div>
  );
};

class RouteVideo extends Component {
  player = React.createRef();
  ready = false;
  state = { videoError: null, attempt: 0 };

  componentDidMount() {
    this.props.dispatch(resetPlayback());
    window.addEventListener('online', this.onOnline);
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, loop, offset } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.seekTo(seekRequest.offset);
    } else if (loop !== prevProps.loop) {
      this.seekTo(offset);
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('online', this.onOnline);
    this.audioTracks?.removeEventListener('addtrack', this.onAddTrack);
  }

  seekTo = (offset) => {
    if (!this.ready) return; // onReady applies the latest request after loading.
    const { currentRoute, loop } = this.props;
    const start = loop?.startTime ?? 0;
    const end = loop ? start + loop.duration : currentRoute.duration;
    const clamped = Math.max(start, Math.min(offset, end));
    const seconds = Math.max(0, (clamped - getVideoStartOffset(currentRoute)) / 1000);
    this.player.current.seekTo(seconds, 'seconds');
  };

  onReady = (player) => {
    if (this.ready) return;
    this.ready = true;
    this.seekTo(this.props.offset);
    const video = player.getInternalPlayer();
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
    this.updateOffset(video);
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  updateOffset = (video) => {
    const { currentRoute, dispatch, loop, isPlaying, offset, videoStatus } = this.props;
    if (!this.ready || video.seeking || videoStatus === VideoStatus.FAILED) return;
    const nextOffset = Math.round(video.currentTime * 1000) + getVideoStartOffset(currentRoute);
    if (isPlaying && loop?.duration > 0 && nextOffset >= loop.startTime + loop.duration
      && loop.startTime + loop.duration > getVideoStartOffset(currentRoute)) {
      this.seekTo(loop.startTime);
    } else if (nextOffset !== offset) {
      dispatch(videoProgress(nextOffset));
    }
  };

  onPlayable = () => {
    const { dispatch } = this.props;
    this.setState({ videoError: null });
    dispatch(setVideoStatus(VideoStatus.READY));
  };

  onSeeking = (event) => {
    this.failure = null;
    this.setState({ videoError: null });
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
    if (error === 'hlsError') {
      if (!data?.fatal) return; // hls.js handles retries and buffer stalls.
      error = data;
    }
    if (!error || error.name === 'AbortError') return;
    const { currentRoute, dispatch } = this.props;
    if (error.name === 'NotAllowedError') {
      dispatch(setVideoStatus(VideoStatus.READY));
      dispatch(pause()); // Leave the play button available after blocked autoplay.
      return;
    }
    const status = error.response?.code;
    const expired = currentRoute.share_exp && Number(currentRoute.share_exp) * 1000 < Date.now();
    if (status === 404) this.failure = 'This video segment has not uploaded yet or has been deleted.';
    else if (navigator.onLine === false) this.failure = OFFLINE;
    else if (expired) this.failure = 'This link has expired';
    else if (status === 401 || status === 403) this.failure = 'You don\'t have access to this video';
    else this.failure = 'Unable to load video';
    // hls.js can give up on a segment ahead of the playhead, so play what is buffered first.
    const video = this.player.current.getInternalPlayer();
    if (!(error.frag?.start > this.player.current.getCurrentTime() && video.readyState >= 3)) this.onBuffer();
  };

  onBuffer = () => {
    const { dispatch, videoStatus } = this.props;
    if (this.failure) {
      dispatch(setVideoStatus(VideoStatus.FAILED));
      this.setState({ videoError: this.failure });
    } else if (videoStatus !== VideoStatus.FAILED) {
      dispatch(setVideoStatus(VideoStatus.LOADING));
    }
  };

  onPlay = () => {
    if (!this.props.isPlaying) this.props.dispatch(play());
  };

  onPause = () => {
    if (this.props.isPlaying && !this.player.current.getInternalPlayer().ended) this.props.dispatch(pause());
  };

  onRetry = () => {
    cancelAnimationFrame(this.frameId);
    this.ready = false;
    this.failure = null;
    this.setState(({ attempt }) => ({ videoError: null, attempt: attempt + 1 }));
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
  };

  onOnline = () => {
    if (this.failure === OFFLINE) this.onRetry();
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
    },
  };

  render() {
    const { currentRoute, isPlaying, desiredPlaySpeed, videoStatus, isMuted } = this.props;
    const { videoError, attempt } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={videoStatus === VideoStatus.LOADING} error={videoError} onRetry={this.onRetry} />
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
