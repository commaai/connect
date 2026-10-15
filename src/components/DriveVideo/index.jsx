/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, play, videoTime } from '../../timeline/playback';
import { isFirefox } from '../../utils/browser.js';

export class RouteVideo extends Component {
  videoPlayer = React.createRef();
  ready = false;
  pendingSeek = false;
  state = { status: 'loading', error: null, attempt: 0 };

  componentDidMount() {
    this.props.dispatch(videoTime(currentOffset()));
    this.props.dispatch(bufferVideo(true));
  }

  componentDidUpdate(prevProps) {
    if (this.props.seekRevision !== prevProps.seekRevision) {
      if (this.props.videoTime == null) this.props.dispatch(videoTime(currentOffset()));
      this.seekToTimeline();
    } else if (this.props.loop !== prevProps.loop) {
      this.onProgress();
    }
  }

  componentWillUnmount() {
    this.props.dispatch(videoTime(null));
    this.props.dispatch(bufferVideo(false));
    this.props.onAudioStatusChange?.(false);
  }

  setStatus = (status, error = null) => {
    this.setState({ status, error });
    this.props.dispatch(bufferVideo(status === 'loading'));
  };

  seekToTimeline = (offset = currentOffset()) => {
    if (!this.ready) return; // onReady applies the latest seek after loading.
    const player = this.videoPlayer.current;
    const target = Math.max(0, (offset - (this.props.currentRoute.videoStartOffset || 0)) / 1000);
    if (Math.abs(player.getCurrentTime() - target) > 0.001) {
      this.pendingSeek = true;
      player.seekTo(target, 'seconds');
    }
  };

  onReady = (player) => {
    if (this.ready) return;
    this.ready = true;
    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => this.props.onAudioStatusChange?.(!!data.audio));
    } else if (player.getInternalPlayer()?.audioTracks?.length) {
      this.props.onAudioStatusChange?.(true);
    }
    this.seekToTimeline();
    this.onProgress();
    if (player.getInternalPlayer()?.readyState >= 2) this.onPlayable();
  };

  onProgress = () => {
    const { currentRoute, loop, dispatch, desiredPlaySpeed } = this.props;
    const player = this.videoPlayer.current;
    const media = player?.getInternalPlayer();
    if (!this.ready || !media || media.seeking || this.pendingSeek || this.state.status === 'failed') return;
    const offset = player.getCurrentTime() * 1000 + (currentRoute.videoStartOffset || 0);
    const start = Math.max(loop?.startTime ?? 0, currentRoute.videoStartOffset || 0);
    if (loop?.duration > 0 && start < loop.startTime + loop.duration
        && (offset < start - 1 || (desiredPlaySpeed && offset >= loop.startTime + loop.duration))) {
      this.seekToTimeline(start);
      return;
    }
    if (offset !== this.props.videoTime) {
      if (this.props.videoTime != null && !media.paused && media.readyState >= 2) this.onPlayable();
      dispatch(videoTime(offset));
    }
  };

  onPlayable = () => {
    if (this.state.status !== 'failed' && (this.state.status !== 'ready' || this.props.isBufferingVideo)) {
      this.setStatus('ready');
    }
  };

  onSeek = () => {
    this.pendingSeek = false;
    this.onPlayable();
    this.onProgress();
  };

  onEnded = () => {
    const { loop, currentRoute, desiredPlaySpeed, dispatch } = this.props;
    const start = Math.max(loop?.startTime ?? 0, currentRoute.videoStartOffset || 0);
    if (desiredPlaySpeed && loop?.duration > 0 && start < loop.startTime + loop.duration) {
      this.seekToTimeline(start);
      this.videoPlayer.current.getInternalPlayer().play()?.catch(this.onError);
    } else {
      dispatch(videoTime(this.videoPlayer.current.getCurrentTime() * 1000 + (currentRoute.videoStartOffset || 0)));
      dispatch(pause());
    }
  };

  onPause = () => {
    if (this.props.desiredPlaySpeed && this.state.status !== 'failed'
        && !this.videoPlayer.current.getInternalPlayer()?.ended) this.props.dispatch(pause());
  };

  onError = (error, data) => {
    if (error === 'hlsError') {
      if (!data?.fatal) return; // hls.js handles recoverable errors itself.
      error = data;
    }
    if (!error || error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') {
      this.setStatus('ready');
      this.props.dispatch(pause()); // A user gesture can resume blocked autoplay.
      return;
    }
    this.setStatus('failed', error.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : 'Unable to load video');
  };

  retry = () => {
    this.ready = false;
    this.pendingSeek = false;
    this.setState(({ attempt }) => ({ attempt: attempt + 1 }));
    this.setStatus('loading');
  };

  resume = () => {
    this.props.dispatch(play());
    this.videoPlayer.current.getInternalPlayer().play()?.catch(this.onError);
  };

  render() {
    const { currentRoute, desiredPlaySpeed, isMuted } = this.props;
    const { status, error, attempt } = this.state;
    const blocked = status === 'ready' && !desiredPlaySpeed;
    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        {(status !== 'ready' || blocked) && (
          <div className="z-50 absolute h-full w-full bg-[#16181AAA] flex items-center justify-center">
            <div className="text-center">
              {error ? <><ErrorOutline className="mb-2" /><Typography>{error}</Typography>
                <Button onClick={this.retry}>Retry</Button></>
                : blocked ? <Button onClick={this.resume}>Play</Button>
                  : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
            </div>
          </div>
        )}
        <ReactPlayer
          key={attempt}
          ref={this.videoPlayer}
          url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(desiredPlaySpeed && status !== 'failed')}
          playbackRate={Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed || 1)}
          onReady={this.onReady}
          onProgress={this.onProgress}
          progressInterval={100}
          onSeek={this.onSeek}
          onEnded={this.onEnded}
          onBuffer={() => { if (status !== 'failed') this.setStatus('loading'); }}
          onBufferEnd={this.onPlayable}
          onPlay={this.onPlayable}
          onPause={this.onPause}
          onError={this.onError}
          config={{ hlsVersion: '1.4.8', hlsOptions: { maxBufferLength: 40 } }}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  videoTime: state.videoTime,
  seekRevision: state.seekRevision,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)((props) => props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} /> : null);
