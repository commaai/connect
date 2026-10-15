/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { pause, play, resetPlayback, setPlaybackSpeed, videoProgress } from '../../timeline/playback';

const FRAME_MS = 50; // qcamera is 20 fps

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button className="mt-2" variant="outlined" onClick={onRetry}>Retry</Button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className={`z-50 absolute h-full w-full bg-[#16181AAA] ${error ? '' : 'animate-[fadein_0.2s_0.3s_both]'}`}>
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

class RouteVideo extends Component {
  player = React.createRef();
  ready = false;
  offset = this.props.loop?.startTime ?? 0; // last position reported to the store
  state = { loading: true, error: null, attempt: 0 };

  componentDidMount() {
    this.props.dispatch(resetPlayback());
    this.props.onAudioStatusChange(false);
    this.frameId = requestAnimationFrame(this.onFrame);
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, currentRoute } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.offset = seekRequest.offset;
      if (this.state.error) {
        this.retry();
      } else {
        this.seekTo(this.offset);
      }
    } else if ((currentRoute.videoStartOffset || 0) !== (prevProps.currentRoute.videoStartOffset || 0)) {
      this.seekTo(this.offset);
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frameId);
  }

  videoTime(offset) {
    return Math.max(0, offset - (this.props.currentRoute.videoStartOffset || 0)) / 1000;
  }

  seekTo(offset) {
    if (this.ready) { // onReady seeks to the latest offset
      this.player.current.seekTo(this.videoTime(offset), 'seconds');
    }
  }

  onReady = (player) => {
    if (this.ready) return;
    this.ready = true;
    this.seekTo(this.offset);
    const { onAudioStatusChange } = this.props;
    const video = player.getInternalPlayer();
    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => onAudioStatusChange(Boolean(data.audio)));
    } else if (video.audioTracks) {
      video.audioTracks.onaddtrack = () => onAudioStatusChange(true);
      onAudioStatusChange(video.audioTracks.length > 0);
    }
  };

  onFrame = () => {
    if (this.ready) this.updateOffset(this.player.current.getInternalPlayer(), FRAME_MS);
    this.frameId = requestAnimationFrame(this.onFrame);
  };

  updateOffset = (video, minStep = 0) => {
    const { currentRoute, loop, isPlaying, seekRequest, dispatch } = this.props;
    if (video.seeking || video.readyState < video.HAVE_CURRENT_DATA) return;
    const videoStart = currentRoute.videoStartOffset || 0;
    const next = Math.round(video.currentTime * 1000) + videoStart;
    // a whole drive plays to the end of its video
    const loopEnd = loop && loop.startTime + loop.duration < currentRoute.duration
      ? loop.startTime + loop.duration
      : Infinity;
    if (isPlaying && next >= loopEnd) {
      if (loopEnd > videoStart) {
        this.seekTo(loop.startTime);
      } else {
        dispatch(pause());
      }
    } else if (Math.abs(next - this.offset) > minStep) {
      this.offset = next;
      dispatch(videoProgress(next, seekRequest));
    }
  };

  onPlay = () => {
    if (!this.props.isPlaying) this.props.dispatch(play());
  };

  onPause = () => {
    if (this.props.isPlaying && !this.player.current.getInternalPlayer().ended) this.props.dispatch(pause());
  };

  onRateChange = (rate) => {
    if (rate !== this.props.desiredPlaySpeed) this.props.dispatch(setPlaybackSpeed(rate));
  };

  onEnded = () => {
    const start = this.props.loop?.startTime ?? 0;
    if (start < this.offset) {
      this.seekTo(start);
      this.player.current.getInternalPlayer().play().catch(this.onError);
    } else {
      this.props.dispatch(pause()); // no video in the selection
    }
  };

  onError = (error, data) => {
    const fromHls = error === 'hlsError';
    if (fromHls) {
      if (!data?.fatal) return; // hls.js retries non-fatal errors itself
      error = data;
    }
    if (!error || error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') {
      this.setState({ loading: false });
      this.props.dispatch(pause());
      return;
    }
    this.retryInPlace = fromHls && Boolean(error.frag);
    const video = this.player.current.getInternalPlayer();
    // hls.js keeps playing what is buffered, so its errors show once playback reaches them
    this.setState(({ loading }) => ({
      loading: loading || !fromHls || video.readyState < video.HAVE_FUTURE_DATA,
      error: error.response?.code === 404
        ? 'This video segment has not uploaded yet or has been deleted.'
        : 'Unable to load video',
    }));
  };

  // hls.js can load a failed segment again in place, anything else needs a new player
  retry = () => {
    if (this.retryInPlace) {
      this.seekTo(this.offset);
      return;
    }
    this.ready = false;
    const startPosition = this.videoTime(this.offset);
    this.config = { ...this.config, hlsOptions: { ...this.config.hlsOptions, startPosition } };
    this.setState(({ attempt }) => ({ loading: true, error: null, attempt: attempt + 1 }));
  };

  onLoading = () => this.setState({ loading: true });

  onPlayable = () => this.setState({ loading: false });

  config = {
    hlsVersion: '1.4.8',
    hlsOptions: {
      maxBufferLength: 40,
      startPosition: this.videoTime(this.props.loop?.startTime ?? 0),
      ...api.video.getHlsOptions?.(this.props.currentRoute),
    },
    attributes: {
      onTimeUpdate: (event) => this.ready && this.updateOffset(event.target),
      onSeeking: (event) => {
        this.setState({ loading: true, error: null });
        this.player.current.getInternalPlayer('hls')?.startLoad(event.target.currentTime);
      },
      onCanPlay: this.onPlayable,
    },
  };

  render() {
    const { currentRoute, isPlaying, desiredPlaySpeed, isMuted } = this.props;
    const { loading, error, attempt } = this.state;
    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={loading} error={loading && error} onRetry={this.retry} />
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
          onPlay={this.onPlay}
          onPause={this.onPause}
          onPlaybackRateChange={this.onRateChange}
          onBuffer={this.onLoading}
          onBufferEnd={this.onPlayable}
          onSeek={this.onPlayable}
          onEnded={this.onEnded}
          onError={this.onError}
          config={this.config}
        />
      </div>
    );
  }
}

const DriveVideo = (props) => (props.currentRoute ? <RouteVideo key={props.currentRoute.fullname} {...props} /> : null);

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  loop: state.loop,
  seekRequest: state.seekRequest,
  isPlaying: state.isPlaying,
  desiredPlaySpeed: state.desiredPlaySpeed,
});

export default connect(stateToProps)(DriveVideo);
