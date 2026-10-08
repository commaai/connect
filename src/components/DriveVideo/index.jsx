/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, updateVideoTime } from '../../timeline/playback';
import { isFirefox } from '../../utils/browser.js';

const NOT_UPLOADED_ERROR = 'This video segment has not uploaded yet or has been deleted.';

const VideoOverlay = ({ loading, error, onRetry, blocked }) => {
  if (!loading && !error) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#16181AAA]">
      <div className="flex max-w-[85%] flex-col items-center gap-3 text-center">
        {error ? (
          <>
            <ErrorOutline />
            <Typography>{error}</Typography>
            <Button
              className="rounded-full bg-white/10 px-4 py-1.5 normal-case text-white hover:bg-white/20"
              onClick={onRetry}
              disableRipple
            >
              {blocked ? 'Play video' : 'Retry'}
            </Button>
          </>
        ) : (
          <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
        )}
      </div>
    </div>
  );
};

export class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.videoPlayer = React.createRef();
    this.state = { videoError: null, retryVersion: 0, playbackBlocked: false };

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onVideoTimeUpdate = this.onVideoTimeUpdate.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoPlaying = this.onVideoPlaying.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.retryVideo = this.retryVideo.bind(this);
  }

  componentDidUpdate(prevProps) {
    const routeChanged = prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname;
    if (routeChanged) {
      this.detachMediaListeners();
      this.detachHlsListener();
      this.recoveredMediaError = false;
      this.props.dispatch(bufferVideo(true));
      this.setState({ videoError: null, playbackBlocked: false });
    } else if (prevProps.seekRevision !== this.props.seekRevision) {
      this.seekToOffset(this.getCurrentOffset());
    }
  }

  componentWillUnmount() {
    this.detachMediaListeners();
    this.detachHlsListener();
  }

  getMediaElement(player = this.videoPlayer.current) {
    return player?.getInternalPlayer?.() || null;
  }

  getVideoOffset(currentTime) {
    const { currentRoute } = this.props;
    return (currentRoute?.videoStartOffset || 0) + currentTime * 1000;
  }

  currentVideoTime(offset) {
    const { currentRoute } = this.props;
    if (!currentRoute) return 0;
    if (offset === undefined) offset = this.getCurrentOffset();
    return Math.max(0, (offset - (currentRoute.videoStartOffset || 0)) / 1000);
  }

  getCurrentOffset() {
    return currentOffset(this.props);
  }

  onPlayerReady() {
    const media = this.getMediaElement();
    if (!media) return;

    this.detachMediaListeners();
    this.mediaElement = media;
    ['timeupdate', 'seeked', 'loadedmetadata', 'canplay'].forEach((event) => {
      media.addEventListener(event, this.onVideoTimeUpdate);
    });
    media.addEventListener('waiting', this.onVideoBuffering);
    media.addEventListener('playing', this.onVideoPlaying);
    media.addEventListener('ended', this.onVideoEnded);
    this.seekToOffset(this.getCurrentOffset());
    this.updateAudioStatus();

    const hls = this.videoPlayer.current?.getInternalPlayer?.('hls');
    const hlsEvents = hls?.constructor?.Events;
    if (hls && hlsEvents?.ERROR) {
      this.detachHlsListener();
      this.hlsPlayer = hls;
      this.hlsErrorEventName = hlsEvents.ERROR;
      this.hlsErrorEvent = (_event, data) => this.onHlsError(data);
      hls.on(this.hlsErrorEventName, this.hlsErrorEvent);

      if (hlsEvents.BUFFER_CODECS) {
        this.hlsAudioEventName = hlsEvents.BUFFER_CODECS;
        this.hlsAudioEvent = (_event, data) => {
          this.props.onAudioStatusChange?.(Boolean(data?.audio));
        };
        hls.on(this.hlsAudioEventName, this.hlsAudioEvent);
      }
    }
  }

  detachMediaListeners() {
    if (!this.mediaElement) return;
    ['timeupdate', 'seeked', 'loadedmetadata', 'canplay'].forEach((event) => {
      this.mediaElement.removeEventListener(event, this.onVideoTimeUpdate);
    });
    this.mediaElement.removeEventListener('waiting', this.onVideoBuffering);
    this.mediaElement.removeEventListener('playing', this.onVideoPlaying);
    this.mediaElement.removeEventListener('ended', this.onVideoEnded);
    this.mediaElement = null;
  }

  detachHlsListener() {
    if (this.hlsPlayer && this.hlsErrorEvent) {
      this.hlsPlayer.off(this.hlsErrorEventName, this.hlsErrorEvent);
    }
    if (this.hlsPlayer && this.hlsAudioEvent) {
      this.hlsPlayer.off(this.hlsAudioEventName, this.hlsAudioEvent);
    }
    this.hlsPlayer = null;
    this.hlsErrorEventName = null;
    this.hlsErrorEvent = null;
    this.hlsAudioEventName = null;
    this.hlsAudioEvent = null;
  }

  updateAudioStatus() {
    const { audioTracks } = this.mediaElement || {};
    if (audioTracks) {
      this.props.onAudioStatusChange?.(audioTracks.length > 0);
    }
  }

  seekToOffset(offset) {
    const media = this.getMediaElement();
    if (!media || !Number.isFinite(offset)) return;

    const requestedTime = this.currentVideoTime(offset);
    if (media.readyState < 1 && requestedTime > 0) {
      this.pendingSeek = requestedTime;
      return;
    }
    const targetTime = Number.isFinite(media.duration)
      ? Math.min(requestedTime, media.duration)
      : requestedTime;
    this.pendingSeek = null;
    if (Math.abs(media.currentTime - targetTime) < 0.15) return;
    try {
      media.currentTime = targetTime;
    } catch (error) {
      console.warn('Unable to seek video yet; waiting for media readiness', error);
      this.pendingSeek = requestedTime;
    }
  }

  onVideoTimeUpdate(event) {
    const media = this.mediaElement;
    if (!media) return;

    if (event?.type === 'loadedmetadata' || event?.type === 'canplay') {
      this.updateAudioStatus();
    }
    if (this.pendingSeek !== null && this.pendingSeek !== undefined && media.readyState >= 1) {
      this.seekToOffset(this.getVideoOffset(this.pendingSeek));
      return;
    }
    if (Number.isFinite(media.currentTime)) {
      this.props.dispatch(updateVideoTime(this.getVideoOffset(media.currentTime)));
    }
  }

  onVideoBuffering() {
    const media = this.mediaElement;
    if (media && Number.isFinite(media.currentTime)) {
      this.props.dispatch(updateVideoTime(this.getVideoOffset(media.currentTime)));
    }
    this.props.dispatch(bufferVideo(true));
  }

  onVideoPlaying() {
    this.setState({ videoError: null, playbackBlocked: false });
    this.updateAudioStatus();
    this.props.dispatch(bufferVideo(false));
  }

  onVideoEnded() {
    const { currentRoute, dispatch } = this.props;
    if (currentRoute) {
      dispatch(updateVideoTime(currentRoute.duration));
    }
    dispatch(pause());
  }

  onHlsError(data) {
    if (!data?.fatal) return;

    const status = data.response?.code || data.networkDetails?.status;
    if (status === 404) {
      this.showVideoError(NOT_UPLOADED_ERROR);
      return;
    }
    if (data.type === 'mediaError' && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.hlsPlayer?.recoverMediaError();
      return;
    }
    this.showVideoError(data.type === 'networkError'
      ? 'Unable to load video. Check network connection.'
      : 'Unable to play this video.');
  }

  onVideoError(error, data) {
    if (error === 'hlsError') {
      this.onHlsError(data);
      return;
    }
    if (error?.name === 'AbortError') return;
    if (error?.name === 'NotAllowedError') {
      this.setState({
        videoError: 'Playback was blocked by your browser. Tap below to start the video.',
        playbackBlocked: true,
      });
      return;
    }

    const mediaError = this.mediaElement?.error;
    if (mediaError?.code === 2) {
      this.showVideoError('Unable to load video. Check network connection.');
    } else if (mediaError?.code === 4) {
      this.showVideoError(NOT_UPLOADED_ERROR);
    } else {
      this.showVideoError(error?.response?.text || 'Unable to play this video.');
    }
  }

  showVideoError(videoError) {
    this.props.dispatch(bufferVideo(true));
    this.setState({ videoError, playbackBlocked: false });
  }

  retryVideo() {
    if (this.state.playbackBlocked) {
      const playResult = this.getMediaElement()?.play();
      if (playResult?.catch) {
        playResult.catch((error) => this.onVideoError(error));
      }
      this.setState({ videoError: null, playbackBlocked: false });
      return;
    }
    this.recoveredMediaError = false;
    this.setState((state) => ({
      videoError: null,
      retryVersion: state.retryVersion + 1,
    }));
    this.props.dispatch(bufferVideo(true));
  }

  render() {
    const {
      currentRoute, desiredPlaySpeed, isBufferingVideo, isMuted,
    } = this.props;
    const { videoError, retryVersion, playbackBlocked } = this.state;
    const src = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : '';
    const playbackRate = Math.max(
      0.1,
      Math.min(isFirefox() && !isMuted ? 8 : 16, desiredPlaySpeed || 1),
    );

    return (
      <div className="relative m-[0_auto] aspect-[1.593] min-h-[200px] max-w-[964px]">
        <VideoOverlay
          loading={isBufferingVideo && !videoError}
          error={videoError}
          blocked={playbackBlocked}
          onRetry={this.retryVideo}
        />
        <ReactPlayer
          key={retryVersion}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={this.onPlayerReady}
          onError={this.onVideoError}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoPlaying}
          onPlay={this.onVideoPlaying}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40 },
          }}
          playbackRate={playbackRate}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  seekRevision: state.seekRevision,
  offset: state.offset,
  startTime: state.startTime,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
