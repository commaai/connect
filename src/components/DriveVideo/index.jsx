/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, seek, updatePlaybackTime } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button color="inherit" onClick={onRetry} className="mt-2">Retry</Button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)] text-white">
        {content}
      </div>
    </div>
  );
};

const VIDEO_EVENTS = [
  'loadstart', 'waiting', 'stalled', 'canplay', 'canplaythrough', 'playing',
  'pause', 'seeking', 'seeked', 'timeupdate', 'ended',
];

class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.videoPlayer = React.createRef();
    this.state = { src: '', videoError: null, retry: 0 };
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoEvent = this.onVideoEvent.bind(this);
    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.retryPlayback = this.retryPlayback.bind(this);
  }

  componentDidMount() {
    this.updateVideoSource();
    this.attachVideoEvents();
    this.syncVideo();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.updateVideoSource();
    }
    this.attachVideoEvents();
    this.syncVideo(prevProps);
  }

  componentWillUnmount() {
    this.detachVideoEvents();
  }

  getVideoElement() {
    return this.videoPlayer.current?.getInternalPlayer?.() || null;
  }

  attachVideoEvents() {
    const video = this.getVideoElement();
    if (!video || video === this.boundVideo) return;
    this.detachVideoEvents();
    this.boundVideo = video;
    VIDEO_EVENTS.forEach((name) => video.addEventListener?.(name, this.onVideoEvent));
  }

  detachVideoEvents() {
    if (!this.boundVideo) return;
    VIDEO_EVENTS.forEach((name) => this.boundVideo.removeEventListener?.(name, this.onVideoEvent));
    this.boundVideo = null;
  }

  updateVideoSource() {
    const { currentRoute } = this.props;
    const src = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : '';
    if (src !== this.state.src) this.setState({ src, videoError: null });
  }

  onPlayerReady(player) {
    this.attachVideoEvents();
    this.syncVideo();
    if (isIos()) {
      const video = player.getInternalPlayer();
      if (video?.audioTracks?.length && this.props.onAudioStatusChange) {
        this.props.onAudioStatusChange(true);
      }
      return;
    }

    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => {
        this.props.onAudioStatusChange?.(Boolean(data.audio));
      });
    }
  }

  onVideoEvent(event) {
    const video = event.currentTarget;
    const { currentRoute, dispatch } = this.props;
    if (event.type === 'loadstart' || event.type === 'waiting' || event.type === 'stalled' || event.type === 'seeking') {
      dispatch(bufferVideo(true));
      return;
    }
    if (event.type === 'playing' || event.type === 'canplay' || event.type === 'canplaythrough' || event.type === 'seeked') {
      if (video.readyState >= 2) dispatch(bufferVideo(false));
      if (event.type === 'playing') this.setState({ videoError: null });
      return;
    }
    if (event.type === 'ended') {
      if (this.props.loop?.duration > 0) {
        const offset = this.props.loop.startTime;
        video.currentTime = Math.max(0, (offset - (currentRoute?.videoStartOffset || 0)) / 1000);
        dispatch(seek(offset));
      } else {
        dispatch(pause());
      }
      return;
    }
    if (event.type !== 'timeupdate' || !currentRoute || !Number.isFinite(video.currentTime)) return;

    const videoOffset = currentRoute.videoStartOffset || 0;
    const offset = (video.currentTime * 1000) + videoOffset;
    const { loop } = this.props;
    if (loop && loop.duration > 0) {
      const loopEnd = loop.startTime + loop.duration;
      if (offset < loop.startTime || offset >= loopEnd) {
        const loopOffset = offset >= loopEnd
          ? loop.startTime + ((offset - loop.startTime) % loop.duration)
          : loop.startTime;
        video.currentTime = Math.max(0, (loopOffset - videoOffset) / 1000);
        dispatch(seek(loopOffset));
        return;
      }
    }
    dispatch(updatePlaybackTime(offset));
  }

  onVideoError(error, data) {
    if (error === 'hlsError') {
      if (data?.type === 'mediaError'
        && ['bufferStalledError', 'bufferNudgeOnStall'].includes(data.details)) {
        this.props.dispatch(bufferVideo(true));
        return;
      }
      const isNotFound = data?.response?.code === 404;
      this.setState({ videoError: isNotFound
        ? 'This video segment has not uploaded yet or has been deleted.'
        : (data?.type === 'networkError'
          ? 'Network error while loading video. Check your connection and retry.'
          : 'Unable to load video.') });
      this.props.dispatch(bufferVideo(true));
      return;
    }
    if (error?.name === 'AbortError' || error?.code === 1) return;

    const video = error?.target;
    const code = video?.error?.code || error?.code;
    const message = code === 2
      ? 'Network error while loading video. Check your connection and retry.'
      : (code === 4 ? 'This video format or segment is unavailable.' : 'Unable to load video.');
    this.setState({ videoError: message });
    this.props.dispatch(bufferVideo(true));
  }

  retryPlayback() {
    this.setState((state) => ({ retry: state.retry + 1, videoError: null }));
    this.props.dispatch(bufferVideo(true));
    const video = this.getVideoElement();
    const playPromise = video?.play?.();
    if (playPromise?.then) {
      playPromise.then(() => this.props.dispatch(bufferVideo(false))).catch((error) => {
        this.setState({ videoError: 'Tap retry to allow playback in this browser.' });
        if (error?.name !== 'AbortError') console.debug('[DriveVideo] user-initiated playback was rejected', error);
      });
    }
  }

  syncVideo(prevProps = {}) {
    const video = this.getVideoElement();
    const { currentRoute, desiredPlaySpeed, dispatch } = this.props;
    if (!video || !currentRoute || video.readyState < 1) return;

    const targetTime = this.currentVideoTime();
    const offsetChanged = prevProps.offset !== this.props.offset
      || prevProps.currentRoute?.fullname !== currentRoute.fullname
      || prevProps.currentRoute?.videoStartOffset !== currentRoute.videoStartOffset;
    if (offsetChanged && Number.isFinite(targetTime) && Math.abs(video.currentTime - targetTime) > 0.35) {
      try {
        video.currentTime = targetTime;
      } catch (error) {
        console.debug('[DriveVideo] seek deferred until media is ready', error);
      }
    }

    const rate = Math.max(0, Math.min(16, Number(desiredPlaySpeed) || 0));
    if (video.playbackRate !== rate && rate > 0) video.playbackRate = rate;
    if (rate === 0 && !video.paused) video.pause();
    if (rate > 0 && video.paused) {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch((error) => {
          if (error?.name !== 'AbortError') {
            this.setState({ videoError: 'Tap retry to start playback.' });
            console.debug('[DriveVideo] playback needs a user gesture', error);
          }
          dispatch(bufferVideo(true));
        });
      }
    }
  }

  currentVideoTime(offset = currentOffset()) {
    const { currentRoute } = this.props;
    if (!currentRoute) return 0;
    return Math.max(0, (offset - (currentRoute.videoStartOffset || 0)) / 1000);
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError, retry } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo && !videoError} error={videoError} onRetry={this.retryPlayback} />
        <ReactPlayer
          key={`${src}:${retry}`}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={this.onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40 },
          }}
          playbackRate={desiredPlaySpeed || 1}
          onBuffer={() => this.props.dispatch(bufferVideo(true))}
          onBufferEnd={() => this.props.dispatch(bufferVideo(false))}
          onPlay={() => this.props.dispatch(bufferVideo(false))}
          onError={this.onVideoError}
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
