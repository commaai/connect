/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, videoTime } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

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

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoSeek = this.onVideoSeek.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoReady = this.onVideoReady.bind(this);

    this.videoPlayer = React.createRef();
    this.lastVideoOffset = null;
    this.lastVideoSyncAt = 0;

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
    this.syncVideoFromProps(prevProps);
  }

  onVideoBuffering() {
    this.props.dispatch(bufferVideo(true));
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
    this.props.dispatch(bufferVideo(false));
  }

  onVideoReady(player) {
    const { onAudioStatusChange } = this.props;
    this.seekVideoToOffset(this.props.offset);
    this.applyPlaybackRate();
    this.onVideoResume();

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
  }

  onVideoSeek(seconds) {
    this.publishVideoTime(seconds, true);
  }

  onVideoProgress({ playedSeconds }) {
    const { loop } = this.props;
    const offset = this.offsetFromVideoTime(playedSeconds);
    if (loop && offset >= loop.startTime + loop.duration) {
      this.seekVideoToOffset(loop.startTime);
      this.publishVideoOffset(loop.startTime, true);
      return;
    }
    this.publishVideoOffset(offset);
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
      this.lastVideoOffset = null;
      this.setState({ src, videoError: null });
    }
  }

  syncVideoFromProps(prevProps) {
    const { offset, startTime, desiredPlaySpeed } = this.props;
    if (prevProps.offset !== offset || prevProps.startTime !== startTime) {
      const targetOffset = currentOffset(this.props);
      if (this.lastVideoOffset === null || Math.abs(targetOffset - this.lastVideoOffset) > 700) {
        this.seekVideoToOffset(targetOffset);
      }
    }

    if (prevProps.desiredPlaySpeed !== desiredPlaySpeed) {
      this.applyPlaybackRate();
    }
  }

  applyPlaybackRate() {
    const { desiredPlaySpeed, isMuted } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const internalPlayer = videoPlayer.getInternalPlayer();
    const newPlaybackRate = Math.max(0, Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed));

    if (internalPlayer.playbackRate !== newPlaybackRate && newPlaybackRate !== 0) {
      internalPlayer.playbackRate = newPlaybackRate;
    }
  }

  publishVideoOffset(offset, force = false) {
    const { dispatch } = this.props;
    const now = Date.now();
    if (!force && this.lastVideoOffset !== null
      && Math.abs(offset - this.lastVideoOffset) < 200
      && now - this.lastVideoSyncAt < 250) {
      return;
    }

    this.lastVideoOffset = offset;
    this.lastVideoSyncAt = now;
    dispatch(videoTime(offset));
  }

  publishVideoTime(seconds, force = false) {
    this.publishVideoOffset(this.offsetFromVideoTime(seconds), force);
  }

  seekVideoToOffset(offset) {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const videoTimeSeconds = this.videoTimeFromOffset(offset);
    const currentTime = videoPlayer.getCurrentTime();
    if (Number.isFinite(currentTime) && Math.abs(videoTimeSeconds - currentTime) < 0.2) {
      return;
    }

    videoPlayer.seekTo(videoTimeSeconds, 'seconds');
    this.lastVideoOffset = this.offsetFromVideoTime(videoTimeSeconds);
  }

  videoTimeFromOffset(offset) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      return 0;
    }

    let videoOffset = offset ?? currentOffset(this.props);
    if (currentRoute.videoStartOffset) {
      videoOffset -= currentRoute.videoStartOffset;
    }

    return Math.max(0, videoOffset / 1000);
  }

  offsetFromVideoTime(seconds) {
    const { currentRoute } = this.props;
    let offset = seconds * 1000;
    if (currentRoute?.videoStartOffset) {
      offset += currentRoute.videoStartOffset;
    }
    return offset;
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError } = this.state;
    const playbackRate = Math.max(0, Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed));

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
          onReady={this.onVideoReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={playbackRate || 1}
          progressInterval={250}
          onProgress={this.onVideoProgress}
          onSeek={this.onVideoSeek}
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
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
