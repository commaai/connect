/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, setVideoClock } from '../../timeline';
import { seek, bufferVideo, pause, play } from '../../timeline/playback';
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

    this.onVideoLoaded = this.onVideoLoaded.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoPause = this.onVideoPause.bind(this);
    this.onVideoPlay = this.onVideoPlay.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.videoOffset = this.videoOffset.bind(this);

    this.videoPlayer = React.createRef();
    this.video = null; // the <video> element, once it is the playback clock

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.props.dispatch(bufferVideo(true));
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);

    // seeks land in redux, the video carries them out
    const { offset, startTime } = this.props;
    if (this.video && (prevProps.offset !== offset || prevProps.startTime !== startTime)) {
      this.seekVideo(offset);
    }
  }

  componentWillUnmount() {
    if (!this.video) {
      return;
    }
    // hand the clock back to redux so the map keeps playing without the video
    const offset = currentOffset();
    this.releaseVideo();
    this.props.dispatch(seek(offset));
    this.props.dispatch(bufferVideo(false));
  }

  // the duration is known once per source, the video can take over the clock
  onVideoLoaded() {
    const { currentRoute, dispatch } = this.props;
    const video = this.videoPlayer.current?.getInternalPlayer();
    if (this.video || !video || !currentRoute) {
      return;
    }
    video.currentTime = this.currentVideoTime();
    this.video = video;
    setVideoClock(currentRoute.fullname, this.videoOffset);
    dispatch(bufferVideo(false));
  }

  onVideoProgress() {
    const { dispatch, loop } = this.props;
    if (!this.video || !loop) {
      return;
    }
    const pastEnd = this.videoOffset() > loop.startTime + loop.duration;
    const beforeStart = this.currentVideoTime(loop.startTime) - this.video.currentTime > 0.5;
    if (pastEnd || beforeStart) {
      dispatch(seek(loop.startTime));
    }
  }

  // keep redux in step when the browser or OS pauses / resumes the video
  onVideoPause() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (desiredPlaySpeed && this.video && !this.video.ended) {
      dispatch(pause());
    }
  }

  onVideoPlay() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (!desiredPlaySpeed) {
      dispatch(play());
    }
    this.onVideoResume();
  }

  onVideoEnded() {
    const { dispatch, loop } = this.props;
    if (this.video) {
      dispatch(seek(loop?.startTime || 0));
      this.video.play().catch(this.onVideoError);
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

    if (e.name === 'NotAllowedError') {
      // autoplay was blocked (e.g. iOS low power mode), wait for the user to press play
      this.props.dispatch(pause());
      this.props.dispatch(bufferVideo(false));
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

  onVideoBuffering() {
    this.props.dispatch(bufferVideo(true));
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
      this.releaseVideo();
    }
  }

  releaseVideo() {
    this.video = null;
    setVideoClock(null);
  }

  seekVideo(offset) {
    const time = this.currentVideoTime(offset);
    if (Math.abs(this.video.currentTime - time) > 0.25) {
      this.video.currentTime = time;
    }
  }

  // inverse of currentVideoTime
  videoOffset() {
    const { currentRoute } = this.props;
    return (this.video.currentTime * 1000) + (currentRoute.videoStartOffset || 0);
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
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
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
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          // most browsers don't support more than 16x, firefox mutes audio above 8x
          playbackRate={Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed || 1)}
          progressInterval={100}
          onDuration={this.onVideoLoaded}
          onProgress={this.onVideoProgress}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onPlay={this.onVideoPlay}
          onPause={this.onVideoPause}
          onEnded={this.onVideoEnded}
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
  loop: state.loop,
  routes: state.routes,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
