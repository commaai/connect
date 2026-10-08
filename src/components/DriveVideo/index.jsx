/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { syncOffset, bufferVideo } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

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

const getVideoState = (videoPlayer) => {
  const currentTime = videoPlayer.getCurrentTime();
  const { buffered } = videoPlayer.getInternalPlayer();

  let bufferRemaining = -1;
  for (let i = 0; i < buffered.length; i++) {
    const end = buffered.end(i);
    if (currentTime >= buffered.start(i) && currentTime <= end) {
      bufferRemaining = end - currentTime;
      break;
    }
  }

  return {
    bufferRemaining,
    hasLoaded: bufferRemaining > 0,
  };
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.syncVideo = this.syncVideo.bind(this);

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
  }

  onVideoBuffering() {
    const { dispatch, currentRoute } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !currentRoute || !videoPlayer.getDuration()) {
      dispatch(bufferVideo(true));
      return;
    }

    const { hasLoaded } = getVideoState(videoPlayer);
    const { readyState } = videoPlayer.getInternalPlayer();
    if (!hasLoaded || readyState < 2) {
      dispatch(bufferVideo(true));
    }
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // buffer but no error
      return;
    }

    if (e.type === 'networkError' && (e.response?.code === 404)) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
  }

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }

    if (e.name === 'AbortError') {
      // ignore
      return;
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }

    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
    this.setState({ videoError });
  }

  onVideoResume() {
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
  }

  onVideoProgress(e) {
    const { dispatch, currentRoute, desiredPlaySpeed, isBufferingVideo } = this.props;
    const video = e.target;
    // below HAVE_FUTURE_DATA the element is stalled
    if (!currentRoute || !video || video.seeking || video.readyState < 3) {
      return;
    }

    // a large gap is a user seek the element has not reached yet
    const drift = Math.abs(this.currentVideoTime() - video.currentTime);
    if (drift <= Math.max(0.1, 0.5 * desiredPlaySpeed)) {
      if (!video.paused) {
        dispatch(syncOffset((currentRoute.videoStartOffset || 0) + video.currentTime * 1000));
      }
      if (isBufferingVideo) {
        dispatch(bufferVideo(false));
      }
    }
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.setState({ src, videoError: null });
    }
  }

  syncVideo() {
    const { desiredPlaySpeed } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const desiredVideoTime = this.currentVideoTime();
    // desiredPlaySpeed is 0 while paused, so the floor stays 0.1s
    if (Math.abs(desiredVideoTime - videoPlayer.getCurrentTime()) > Math.max(0.1, 0.5 * desiredPlaySpeed)) {
      videoPlayer.seekTo(desiredVideoTime, 'seconds');
    }

    // iOS will not advance readyState unless playback is paused
    if (!isIos() || videoPlayer.getInternalPlayer('hls')) {
      return;
    }
    const internalPlayer = videoPlayer.getInternalPlayer();
    const { hasLoaded } = getVideoState(videoPlayer);
    if (!hasLoaded || internalPlayer.readyState < 2) {
      internalPlayer.playbackRate = 0;
      if (!this.props.isBufferingVideo) {
        this.props.dispatch(bufferVideo(true));
      }
    } else if (desiredPlaySpeed && internalPlayer.playbackRate !== desiredPlaySpeed) {
      internalPlayer.playbackRate = desiredPlaySpeed;
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
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, onAudioStatusChange, isMuted } = this.props;
    const { src, videoError } = this.state;

    const onPlayerReady = (player) => {
      if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
        const videoElement = player.getInternalPlayer();
        if (videoElement && videoElement.audioTracks && videoElement.audioTracks.length > 0) {
          if (onAudioStatusChange) {
            onAudioStatusChange(true);
          }
        }
      } else { // on other platforms, inspect audio tracks before hls.js changes things
        const hlsPlayer = player.getInternalPlayer('hls');
        if (hlsPlayer) {
          hlsPlayer.on('hlsBufferCodecs', (event, data) => {
            if (onAudioStatusChange) {
              onAudioStatusChange(!!data.audio);
            }
          });
        }
      }
    };

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
          onReady={onPlayerReady}
          config={{
            attributes: { onTimeUpdate: this.onVideoProgress, onCanPlay: this.onVideoProgress },
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed}
          onDuration={this.syncVideo}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onPlay={this.onVideoResume}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  startTime: state.startTime,
  isBufferingVideo: state.isBufferingVideo,
  routes: state.routes,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
