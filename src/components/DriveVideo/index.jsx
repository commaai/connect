/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, bufferVideo } from '../../timeline/playback';
import { attachVideo, detachVideo, seekVideo } from '../../timeline/video';
import { isIos, isFirefox } from '../../utils/browser.js';

// native media events that mean the video is stalled waiting for data, or has data to show
const BUFFERING_EVENTS = ['loadstart', 'waiting', 'seeking'];
const READY_EVENTS = ['canplay', 'playing', 'seeked'];

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

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onBuffering = this.onBuffering.bind(this);
    this.onReadyToPlay = this.onReadyToPlay.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);

    this.video = null;
    this.playbackRate = 1;

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
  }

  componentWillUnmount() {
    // hand the position over to the playback clock, which keeps time without a video
    const offset = currentOffset();
    this.setVideoElement(null);
    this.props.dispatch(seek(offset));
  }

  onPlayerReady(player) {
    this.setVideoElement(player.getInternalPlayer());

    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) {
      return;
    }
    if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
      const videoElement = player.getInternalPlayer();
      if (videoElement && videoElement.audioTracks && videoElement.audioTracks.length > 0) {
        onAudioStatusChange(true);
      }
    } else { // on other platforms, inspect audio tracks before hls.js changes things
      const hlsPlayer = player.getInternalPlayer('hls');
      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          onAudioStatusChange(!!data.audio);
        });
      }
    }
  }

  // once the video knows its duration it takes over keeping time, starting where the playback clock is
  onLoadedMetadata() {
    const { currentRoute } = this.props;
    if (!currentRoute || !this.video) {
      return;
    }
    const offset = currentOffset();
    attachVideo(this.video, currentRoute.fullname);
    seekVideo(currentRoute, offset);
  }

  onBuffering() {
    this.setBuffering(true);
  }

  onReadyToPlay() {
    this.setBuffering(false);
    if (this.state.videoError) {
      this.setState({ videoError: null });
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

  setBuffering(buffering) {
    const { dispatch, isBufferingVideo } = this.props;
    if (isBufferingVideo !== buffering) {
      dispatch(bufferVideo(buffering));
    }
  }

  setVideoElement(el) {
    if (el === this.video) {
      return;
    }
    if (this.video) {
      detachVideo(this.video);
      this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
      BUFFERING_EVENTS.forEach((ev) => this.video.removeEventListener(ev, this.onBuffering));
      READY_EVENTS.forEach((ev) => this.video.removeEventListener(ev, this.onReadyToPlay));
    }
    this.video = el || null;
    if (this.video) {
      this.video.addEventListener('loadedmetadata', this.onLoadedMetadata);
      BUFFERING_EVENTS.forEach((ev) => this.video.addEventListener(ev, this.onBuffering));
      READY_EVENTS.forEach((ev) => this.video.addEventListener(ev, this.onReadyToPlay));
      if (this.video.readyState > 0) {
        // metadata loaded before we started listening
        this.onLoadedMetadata();
      }
    }
  }

  getPlaybackRate() {
    const { desiredPlaySpeed, isMuted } = this.props;
    if (desiredPlaySpeed > 0) {
      // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x
      this.playbackRate = Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed);
    }
    // keep the last rate while paused, a rate of 0 is not valid
    return this.playbackRate;
  }

  updateVideoSource(prevProps) {
    const { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      // the video of the previous route no longer keeps time
      if (this.video) {
        detachVideo(this.video);
      }
      this.setState({
        src: api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig),
        videoError: null,
      });
    }
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          playbackRate={this.getPlaybackRate()}
          onReady={this.onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
