/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline, Refresh } from '../../icons';
import { currentOffset, videoController } from '../../timeline';
import { bufferVideo, pause } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error, onRetry }) => {
  if (error) {
    return (
      <div className="z-50 absolute inset-0 flex flex-col items-center justify-center bg-[#16181acc] px-6 text-center select-none">
        <ErrorOutline style={{ color: '#ef4444', fontSize: 44, marginBottom: 12 }} />
        <Typography variant="body1" style={{ color: Colors.white, maxWidth: 460, marginBottom: 16 }}>
          {error}
        </Typography>
        {onRetry && (
          <Button
            variant="outlined"
            onClick={onRetry}
            style={{
              color: Colors.white,
              borderColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: 20,
              textTransform: 'none',
              padding: '6px 20px',
            }}
          >
            <Refresh style={{ fontSize: 18, marginRight: 8 }} />
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="z-50 absolute inset-0 flex items-center justify-center bg-[#16181a88] pointer-events-none transition-opacity duration-200">
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={48} />
      </div>
    );
  }

  return null;
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.videoPlayer = React.createRef();
    this.videoElement = null;
    this.pendingSeek = null;
    this.state = { src: null, videoError: null, isBuffering: false };

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onBuffer = this.onBuffer.bind(this);
    this.onBufferEnd = this.onBufferEnd.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onError = this.onError.bind(this);
    this.onProgress = this.onProgress.bind(this);
    this.onLoadedMetadata = this.applyPendingSeek.bind(this);
    this.retry = this.retry.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.updateSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateSource(prevProps);

    if (prevProps.offset !== this.props.offset && this.props.offset !== null) {
      this.seek(this.props.offset);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.detachListeners();
    videoController.clear();
  }

  attachListeners(el) {
    if (!el || typeof el.addEventListener !== 'function') return;
    this.detachListeners();
    this.videoElement = el;

    el.addEventListener('loadedmetadata', this.onLoadedMetadata);
    el.addEventListener('waiting', this.onBuffer);
    el.addEventListener('playing', this.onBufferEnd);
    el.addEventListener('canplay', this.onBufferEnd);
    el.addEventListener('timeupdate', this.onProgress);
    el.addEventListener('ended', this.onEnded);
  }

  detachListeners() {
    const el = this.videoElement;
    if (!el || typeof el.removeEventListener !== 'function') return;
    el.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    el.removeEventListener('waiting', this.onBuffer);
    el.removeEventListener('playing', this.onBufferEnd);
    el.removeEventListener('canplay', this.onBufferEnd);
    el.removeEventListener('timeupdate', this.onProgress);
    el.removeEventListener('ended', this.onEnded);
    this.videoElement = null;
  }

  currentVideoTime(offset = currentOffset()) {
    const { currentRoute } = this.props;
    return Math.max(0, ((offset || 0) - (currentRoute?.videoStartOffset || 0)) / 1000);
  }

  seek(offset) {
    const target = this.currentVideoTime(offset);
    if (this.videoElement && this.videoElement.readyState >= 1) {
      if (Math.abs(this.videoElement.currentTime - target) > 0.2) {
        this.videoElement.currentTime = target;
      }
    } else {
      this.pendingSeek = target;
    }
  }

  applyPendingSeek() {
    if (this.pendingSeek !== null && this.videoElement && this.videoElement.readyState >= 1) {
      this.videoElement.currentTime = this.pendingSeek;
      this.pendingSeek = null;
    }
  }

  updateSource(prevProps) {
    const { currentRoute, offset, zoom } = this.props;
    if (!currentRoute) {
      if (this.state.src !== '') {
        this.setState({ src: '', videoError: null, isBuffering: false });
        videoController.clear();
      }
      return;
    }

    if (!prevProps.currentRoute || prevProps.currentRoute.fullname !== currentRoute.fullname) {
      const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      const startOffset = offset ?? zoom?.start ?? 0;
      this.pendingSeek = this.currentVideoTime(startOffset);
      this.setState({ src, videoError: null, isBuffering: true });
      videoController.setRoute(currentRoute);
    }
  }

  retry() {
    const { currentRoute } = this.props;
    if (!currentRoute) return;
    this.setState({
      src: api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig),
      videoError: null,
      isBuffering: true,
    });
  }

  onPlayerReady(player) {
    const { onAudioStatusChange, currentRoute } = this.props;
    const el = player.getInternalPlayer();
    if (!el) return;

    this.attachListeners(el);
    videoController.setVideoElement(el, currentRoute);

    if (isIos()) {
      if (el.audioTracks?.length > 0) onAudioStatusChange?.(true);
    } else {
      const hls = player.getInternalPlayer('hls');
      if (hls?.on) {
        hls.on('hlsBufferCodecs', (_e, data) => onAudioStatusChange?.(Boolean(data?.audio)));
      }
    }

    this.applyPendingSeek();
  }

  onBuffer() {
    if (!this.mounted) return;
    this.setState({ isBuffering: true });
    this.props.dispatch(bufferVideo(true));
  }

  onBufferEnd() {
    if (!this.mounted) return;
    this.setState({ isBuffering: false, videoError: null });
    this.props.dispatch(bufferVideo(false));
    this.applyPendingSeek();
  }

  onEnded() {
    if (!this.mounted) return;
    const { loop, dispatch } = this.props;
    if (loop?.startTime != null && loop.duration && this.videoElement) {
      this.videoElement.currentTime = this.currentVideoTime(loop.startTime);
      this.videoElement.play()?.catch?.(() => {});
    } else {
      dispatch(pause());
    }
  }

  onProgress() {
    if (!this.videoElement || !this.mounted) return;
    const { loop, currentRoute } = this.props;
    if (loop?.startTime != null && loop.duration) {
      const curOffset = (this.videoElement.currentTime * 1000) + (currentRoute?.videoStartOffset || 0);
      if (curOffset >= loop.startTime + loop.duration) {
        this.videoElement.currentTime = this.currentVideoTime(loop.startTime);
      }
    }
  }

  onError(e, data) {
    if (!this.mounted) return;
    if (e === 'hlsError') {
      if (data?.type === 'mediaError' && (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall')) {
        return;
      }
      this.props.dispatch(bufferVideo(true));
      const msg = (data?.type === 'networkError' && data?.response?.code === 404)
        ? 'This video segment has not uploaded yet or has been deleted.'
        : (data?.type === 'networkError' ? 'Unable to load video. Check network connection.' : 'Unable to load video.');
      this.setState({ videoError: msg });
      return;
    }
    if (e?.name === 'AbortError' || e?.target?.src?.endsWith('undefined')) return;
    this.props.dispatch(bufferVideo(true));
    this.setState({ videoError: e?.response?.code === 404 ? 'This video segment has not uploaded yet or has been deleted.' : 'Unable to load video. Check network connection.' });
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError, isBuffering } = this.state;
    const playSpeed = Math.min((isFirefox() && !isMuted) ? 8 : 16, Math.max(0.1, desiredPlaySpeed || 1));

    return (
      <div className="min-h-50 relative max-w-241 m-[0_auto] aspect-[1.593] bg-black/40 rounded-md overflow-hidden">
        <VideoOverlay loading={(isBuffering || isBufferingVideo) && !videoError} error={videoError} onRetry={this.retry} />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed > 0)}
          playbackRate={playSpeed}
          onReady={this.onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40 },
            file: { attributes: { playsInline: true, 'webkit-playsinline': 'true' } },
          }}
          onBuffer={this.onBuffer}
          onBufferEnd={this.onBufferEnd}
          onPlay={this.onBufferEnd}
          onPause={() => this.setState({ isBuffering: false })}
          onProgress={this.onProgress}
          onEnded={this.onEnded}
          onError={this.onError}
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
  zoom: state.zoom,
});

export default connect(stateToProps)(DriveVideo);
