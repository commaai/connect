/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, bufferVideo, pause, videoTime } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <button
          className="mt-3 rounded-full border border-white/30 px-4 py-1.5 text-sm text-white hover:bg-white/10"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
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
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onMediaCanPlay = this.onMediaCanPlay.bind(this);
    this.retryVideo = this.retryVideo.bind(this);

    this.videoPlayer = React.createRef();
    this.mediaElement = null;

    this.state = {
      src: null,
      videoError: null,
      retrySequence: 0,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.attachMediaElement();
    if (prevProps.seekSequence !== this.props.seekSequence) {
      this.seekVideo(this.currentVideoTime());
    }
  }

  componentWillUnmount() {
    if (typeof this.mediaElement?.removeEventListener === 'function') {
      this.mediaElement.removeEventListener('canplay', this.onMediaCanPlay);
    }
  }

  onVideoBuffering() {
    this.props.dispatch(bufferVideo(true));
  }

  /**
   * @param {Error} e
   */
  onVideoError(e, data) {
    if (!e) {
      console.error('Unknown video error');
      this.props.dispatch(bufferVideo(true));
      this.setState({ videoError: 'Unable to load video.' });
      return;
    }

    if (e === 'hlsError') {
      this.props.dispatch(bufferVideo(true));
      if (!data?.fatal
        && data?.type === 'mediaError'
        && (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall')) {
        return;
      }

      console.error('HLS playback failed', data);
      const videoError = data?.response?.code === 404
        ? 'This video segment is unavailable or has not uploaded yet.'
        : (data?.type === 'networkError'
          ? 'Unable to load video. Check your network connection and try again.'
          : 'Unable to load video. Try loading it again.');
      this.setState({ videoError });
      return;
    }

    if (e.name === 'AbortError') {
      return;
    }

    console.error('Video playback failed', e);
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    const mediaError = e.target?.error;
    const status = e.response?.code || e.target?.status;
    const videoError = status === 404 || mediaError?.code === 4
      ? 'This video is unavailable or has not uploaded yet.'
      : (e.type === 'networkError' || mediaError?.code === 2
        ? 'Unable to load video. Check your network connection and try again.'
        : (mediaError?.code === 3
          ? 'The video could not be decoded. Try loading it again.'
          : (e.response?.text || 'Unable to load video. Try loading it again.')));
    this.setState({ videoError });
  }

  onVideoResume() {
    this.props.dispatch(bufferVideo(false));
    if (this.state.videoError) this.setState({ videoError: null });
  }

  onMediaCanPlay() {
    this.props.dispatch(bufferVideo(false));
    this.playVideo();
  }

  onVideoProgress({ playedSeconds }) {
    if (!Number.isFinite(playedSeconds)) return;

    const { currentRoute, dispatch, loop } = this.props;
    if (!currentRoute) return;

    const routeOffset = playedSeconds * 1000 + (currentRoute.videoStartOffset || 0);
    if (loop?.duration > 0 && loop.startTime != null
      && (routeOffset < loop.startTime || routeOffset >= loop.startTime + loop.duration)) {
      dispatch(seek(loop.startTime));
      return;
    }

    dispatch(videoTime(routeOffset));
  }

  onVideoEnded() {
    const { currentRoute, desiredPlaySpeed, dispatch, loop } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !currentRoute) return;

    if (desiredPlaySpeed && loop?.duration > 0) {
      dispatch(seek(loop.startTime));
      this.seekVideo(this.currentVideoTime(loop.startTime));
      this.playVideo();
      return;
    }

    this.onVideoProgress({ playedSeconds: videoPlayer.getCurrentTime() });
    dispatch(pause());
  }

  onPlayerReady() {
    const player = this.videoPlayer.current;
    if (!player) return;

    this.seekVideo(this.currentVideoTime());
    const videoElement = player.getInternalPlayer();
    if (videoElement?.readyState >= 2) {
      this.onMediaCanPlay();
    }
    if (isIos()) {
      this.props.onAudioStatusChange?.(Boolean(videoElement?.audioTracks?.length));
    } else {
      const hlsPlayer = player.getInternalPlayer('hls');
      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          this.props.onAudioStatusChange?.(Boolean(data.audio));
        });
      }
    }
  }

  retryVideo() {
    this.setState((state) => ({
      videoError: null,
      retrySequence: state.retrySequence + 1,
    }));
    this.props.dispatch(bufferVideo(true));
  }

  seekVideo(seconds) {
    if (this.videoPlayer.current) {
      this.videoPlayer.current.seekTo(seconds, 'seconds');
    }
  }

  attachMediaElement() {
    const mediaElement = this.videoPlayer.current?.getInternalPlayer();
    if (mediaElement === this.mediaElement) return;

    if (typeof this.mediaElement?.removeEventListener === 'function') {
      this.mediaElement.removeEventListener('canplay', this.onMediaCanPlay);
    }
    this.mediaElement = mediaElement;
    if (!mediaElement) return;

    if (mediaElement.readyState >= 2) {
      this.onMediaCanPlay();
    } else if (typeof mediaElement.addEventListener === 'function') {
      mediaElement.addEventListener('canplay', this.onMediaCanPlay, { once: true });
    }
  }

  playVideo() {
    if (!this.props.desiredPlaySpeed) return;

    const videoElement = this.videoPlayer.current?.getInternalPlayer();
    if (!videoElement || !videoElement.paused) return;

    const playResult = videoElement.play();
    if (playResult) {
      playResult.catch((error) => {
        if (error?.name !== 'AbortError') this.onVideoError(error);
      });
    }
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null, retrySequence: 0 });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.setState({ src, videoError: null, retrySequence: 0 });
      this.props.dispatch(bufferVideo(true));
    }
  }

  currentVideoTime(offset = currentOffset()) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      return 0;
    }

    if (currentRoute.videoStartOffset) {
      offset -= currentRoute.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError, retrySequence } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} onRetry={this.retryVideo} />
        {src && (
          <ReactPlayer
            key={`${src}-${retrySequence}`}
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
              hlsOptions: {
                maxBufferLength: 40,
              },
            }}
            playbackRate={desiredPlaySpeed}
            progressInterval={250}
            onBuffer={this.onVideoBuffering}
            onBufferEnd={this.onVideoResume}
            onPlay={this.onVideoResume}
            onProgress={this.onVideoProgress}
            onEnded={this.onVideoEnded}
            onError={this.onVideoError}
          />
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  seekSequence: state.seekSequence,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
