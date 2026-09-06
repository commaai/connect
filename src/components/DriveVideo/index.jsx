/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import {
  setPlaybackSpeed, resetPlayback, play, pause, videoProgress, setHasAudio, setVideoStatus, VideoStatus,
} from '../../timeline/playback';

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

// Each route owns its player and listeners. Changing routes remounts this
// component, so readiness, errors and pending media events cannot leak across.
class RouteVideo extends Component {
  player = React.createRef();
  ready = false;
  state = { videoError: null };

  componentDidMount() {
    this.props.dispatch(resetPlayback());
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
  }

  seekTo = (offset) => {
    if (!this.ready) return; // onReady applies the latest request after loading.
    const { currentRoute, loop } = this.props;
    const start = loop?.startTime ?? 0;
    const end = loop ? start + loop.duration : currentRoute.duration;
    const clamped = Math.max(start, Math.min(offset, end));
    const seconds = Math.max(0, (clamped - (currentRoute.videoStartOffset || 0)) / 1000);
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
    } else {
      this.props.dispatch(setHasAudio(!!video.audioTracks?.length));
    }
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  // Sample the media clock at display refresh rate, even for low-frame-rate
  // videos. Native timeupdate events also cover background and paused seeks.
  onAnimationFrame = () => {
    const video = this.player.current.getInternalPlayer();
    this.updateOffset(video);
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  updateOffset = (video) => {
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
    this.setState({ videoError: null });
    dispatch(setVideoStatus(VideoStatus.READY));
  };

  onSeeking = (event) => {
    this.setState({ videoError: null });
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
    // A fatal HLS error stops loading even if buffered video can still play.
    // Each seek starts a new load attempt at the requested media position.
    this.player.current.getInternalPlayer('hls')?.startLoad(event.target.currentTime);
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
    const { dispatch } = this.props;
    if (error.name === 'NotAllowedError') {
      dispatch(setVideoStatus(VideoStatus.READY));
      dispatch(pause()); // Leave the play button available after blocked autoplay.
      return;
    }
    dispatch(setVideoStatus(VideoStatus.FAILED));
    this.setState({
      videoError: error.response?.code === 404
        ? 'This video segment has not uploaded yet or has been deleted.'
        : 'Unable to load video',
    });
  };

  render() {
    const { currentRoute, isPlaying, desiredPlaySpeed, videoStatus, isMuted, dispatch } = this.props;
    const { videoError } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={videoStatus === VideoStatus.LOADING} error={videoError} />
        <ReactPlayer
          ref={this.player}
          url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={isPlaying}
          playbackRate={desiredPlaySpeed}
          onReady={this.onReady}
          onBuffer={() => {
            if (videoStatus !== VideoStatus.FAILED) dispatch(setVideoStatus(VideoStatus.LOADING));
          }}
          onBufferEnd={this.onPlayable}
          onPlay={() => {
            if (!isPlaying) dispatch(play());
          }}
          onPause={() => {
            if (isPlaying && !this.player.current.getInternalPlayer().ended) dispatch(pause());
          }}
          onPlaybackRateChange={(rate) => {
            if (rate !== desiredPlaySpeed) dispatch(setPlaybackSpeed(rate));
          }}
          onEnded={this.onEnded}
          onError={this.onError}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40, ...api.video.getHlsOptions?.(currentRoute) },
            attributes: {
              onTimeUpdate: (event) => this.updateOffset(event.target),
              onSeeking: this.onSeeking,
              onCanPlay: this.onPlayable,
            },
          }}
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
