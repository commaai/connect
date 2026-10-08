/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, pause, play, bufferVideo, videoProgress } from '../../timeline/playback';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button onClick={onRetry} color="primary">Retry video</Button>
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
    this.videoPlayer = React.createRef();
    this.state = { src: null, videoError: null, retry: 0 };
    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoPause = this.onVideoPause.bind(this);
    this.onVideoSeek = this.onVideoSeek.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.retryVideo = this.retryVideo.bind(this);
    this.onAudioCodecs = this.onAudioCodecs.bind(this);
    this.appliedSeek = props.seekRequest;
    this.lastSpeed = props.desiredPlaySpeed || 1;
  }

  componentDidMount() {
    this.updateVideoSource({ currentRoute: this.props.currentRoute });
  }

  componentDidUpdate(prevProps) {
    if (this.updateVideoSource(prevProps)) return;
    if (this.props.desiredPlaySpeed) this.lastSpeed = this.props.desiredPlaySpeed;
    if (prevProps.seekRequest !== this.props.seekRequest) {
      this.pendingSeek = { offset: this.props.seekRequest.offset, request: this.props.seekRequest };
      if (this.state.videoError) this.reloadVideo();
      else this.applySeek();
    } else if (this.state.videoError && !prevProps.desiredPlaySpeed && this.props.desiredPlaySpeed) {
      this.reloadVideo();
    } else if (prevProps.currentRoute?.videoStartOffset !== this.props.currentRoute?.videoStartOffset) {
      if (this.pendingSeek) this.applySeek();
      else this.onVideoProgress();
    } else if (prevProps.loop !== this.props.loop && this.props.loop) {
      this.pendingSeek = { offset: currentOffset(this.props), request: this.props.seekRequest };
      this.applySeek();
    }
  }

  componentWillUnmount() {
    this.hls?.off('hlsBufferCodecs', this.onAudioCodecs);
    // The existing map view keeps playing when the video is unmounted.
    const offset = this.video && !this.pendingSeek
      ? this.video.currentTime * 1000 + (this.props.currentRoute?.videoStartOffset || 0)
      : currentOffset(this.props);
    this.props.dispatch(videoProgress(this.props.currentRoute?.fullname, offset, null));
  }

  updateVideoSource(prevProps) {
    const { currentRoute, dispatch, seekRequest, zoom } = this.props;
    const src = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : '';
    const routeChanged = prevProps.currentRoute?.fullname !== currentRoute?.fullname;
    if (src === this.state.src && !routeChanged) return false;
    this.hls?.off('hlsBufferCodecs', this.onAudioCodecs);
    this.video = null;
    this.mediaRecoveryAttempted = false;
    this.recoveringMedia = false;
    const offset = routeChanged ? (zoom?.start || 0) : currentOffset(this.props);
    this.pendingSeek = { offset, request: seekRequest };
    this.appliedSeek = seekRequest;
    this.setState({ src, videoError: null });
    this.props.onAudioStatusChange?.(false);
    if (currentRoute) {
      dispatch(videoProgress(currentRoute.fullname, offset, 0, seekRequest));
      dispatch(bufferVideo(true));
    }
    return true;
  }

  onPlayerReady(player) {
    this.video = player.getInternalPlayer();
    const hls = player.getInternalPlayer('hls');
    if (hls !== this.hls) {
      this.hls?.off('hlsBufferCodecs', this.onAudioCodecs);
      this.hls = hls;
      hls?.on('hlsBufferCodecs', this.onAudioCodecs);
    }
    this.applySeek();
    this.onVideoResume();
  }

  onAudioCodecs(_event, data) {
    this.props.onAudioStatusChange?.(Boolean(data.audio));
  }

  applySeek() {
    const { currentRoute, loop } = this.props;
    if (!this.pendingSeek || !this.video || this.video.readyState < 1 || !currentRoute) return;
    const start = currentRoute.videoStartOffset || 0;
    const end = Number.isFinite(this.video.duration) ? this.video.duration : Infinity;
    if (loop && (loop.startTime + loop.duration <= start || loop.startTime >= start + end * 1000)) {
      this.onVideoError(new Error('No video is available in this selection.'));
      return;
    }
    const offset = Math.max(start, loop?.startTime || 0, this.pendingSeek.offset);
    const seconds = Math.min(end, Math.max(0, (offset - start) / 1000));
    if (Math.abs(this.video.currentTime - seconds) < 0.01) this.onVideoSeek();
    else this.videoPlayer.current.seekTo(seconds, 'seconds');
  }

  reportProgress(speed) {
    const { currentRoute, dispatch } = this.props;
    if (!this.video || !currentRoute || this.pendingSeek || !Number.isFinite(this.video.currentTime)) return;
    const offset = this.video.currentTime * 1000 + (currentRoute.videoStartOffset || 0);
    dispatch(videoProgress(currentRoute.fullname, offset, speed, this.appliedSeek));
  }

  onVideoProgress() {
    if (!this.video || this.pendingSeek) return;
    const { currentRoute, loop, isBufferingVideo } = this.props;
    const offset = this.video.currentTime * 1000 + (currentRoute?.videoStartOffset || 0);
    if (!this.video.paused && loop?.duration > 0 && offset >= loop.startTime + loop.duration) {
      this.onVideoEnded();
      return;
    }
    const moving = !this.video.paused && !this.video.seeking && this.video.readyState >= 3 && !isBufferingVideo;
    this.reportProgress(moving ? this.video.playbackRate : 0);
  }

  onVideoBuffering() {
    this.reportProgress(0);
    if (!this.props.isBufferingVideo) this.props.dispatch(bufferVideo(true));
  }

  onVideoResume() {
    if (!this.video) return;
    if (!this.hls && this.video.audioTracks) {
      this.props.onAudioStatusChange?.(this.video.audioTracks.length > 0);
    }
    if (this.video.readyState < 3 || this.video.seeking || this.pendingSeek) return;
    if (this.recoveringMedia) {
      this.recoveringMedia = false;
      // HLS recovery can pause the element without changing the user's intent.
      this.onVideoSeek();
      return;
    }
    if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
    if (this.state.videoError) this.setState({ videoError: null });
    this.reportProgress(this.video.paused ? 0 : this.video.playbackRate);
  }

  onVideoPause() {
    this.reportProgress(0);
    if (this.video && !this.pendingSeek && !this.recoveringMedia && !this.video.seeking
      && !this.video.ended && this.props.desiredPlaySpeed) {
      this.props.dispatch(pause());
    }
  }

  onVideoSeek() {
    if (this.video?.seeking) return;
    if (this.pendingSeek) this.appliedSeek = this.pendingSeek.request;
    this.pendingSeek = null;
    this.onVideoResume();
    if (this.video?.paused && !this.video.ended && this.props.desiredPlaySpeed) {
      const video = this.video;
      video.play()?.catch((error) => { if (video === this.video) this.onVideoError(error); });
    }
  }

  onVideoEnded() {
    const { zoom, currentRoute, loop, dispatch } = this.props;
    this.reportProgress(0);
    if (loop?.duration > 0 && zoom && (zoom.start > 0 || zoom.end < currentRoute.duration)) {
      dispatch(seek(loop.startTime));
    } else {
      dispatch(pause());
    }
  }

  onVideoError(error, data, hls) {
    if (!error || error.name === 'AbortError') return;
    if (error === 'hlsError' && data && !data.fatal) return;
    if (error.name === 'NotAllowedError') {
      this.reportProgress(0);
      this.props.dispatch(pause());
      return;
    }
    this.onVideoBuffering();
    if (error === 'hlsError' && data) {
      if (data.type === 'mediaError' && hls && !this.mediaRecoveryAttempted) {
        this.mediaRecoveryAttempted = true;
        this.recoveringMedia = true;
        hls.recoverMediaError();
        return;
      }
    }
    const missing = data?.response?.code === 404 || error.response?.code === 404;
    const videoError = missing ? 'This video segment has not uploaded yet or has been deleted.'
      : error.message || 'Unable to load video. Check network connection.';
    this.setState({ videoError });
    this.props.dispatch(pause());
  }

  reloadVideo() {
    this.video = null;
    this.mediaRecoveryAttempted = false;
    this.recoveringMedia = false;
    this.pendingSeek = this.pendingSeek || { offset: currentOffset(this.props), request: this.props.seekRequest };
    this.props.dispatch(bufferVideo(true));
    this.setState(({ retry }) => ({ retry: retry + 1, videoError: null }));
  }

  retryVideo() {
    this.reloadVideo();
    this.props.dispatch(play(this.lastSpeed));
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError, retry } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} onRetry={this.retryVideo} />
        {src && <ReactPlayer
          key={`${currentRoute?.fullname}:${src}:${retry}`}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed && !videoError)}
          playbackRate={desiredPlaySpeed || 1}
          onReady={this.onPlayerReady}
          onProgress={this.onVideoProgress}
          progressInterval={100}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onPlay={() => {
            if (this.video && !desiredPlaySpeed) this.props.dispatch(play(this.video.playbackRate));
            this.onVideoResume();
          }}
          onPause={this.onVideoPause}
          onSeek={this.onVideoSeek}
          onEnded={this.onVideoEnded}
          onError={(error, data, hls) => {
            if (src === this.state.src && retry === this.state.retry
              && currentRoute?.fullname === this.props.currentRoute?.fullname) this.onVideoError(error, data, hls);
          }}
          config={{
            file: {
              hlsVersion: '1.4.8',
              hlsOptions: { maxBufferLength: 40 },
              attributes: {
                onLoadedMetadata: () => { this.applySeek(); this.onVideoResume(); },
                onCanPlay: this.onVideoResume,
                onSeeking: () => this.reportProgress(0),
                onRateChange: this.onVideoProgress,
              },
            },
          }}
        />}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  startTime: state.startTime,
  videoPlaySpeed: state.videoPlaySpeed,
  seekRequest: state.seekRequest,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
  zoom: state.zoom,
});

export default connect(stateToProps)(DriveVideo);
