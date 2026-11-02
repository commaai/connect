/* eslint-disable camelcase */
import { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { setVideoElement, routeMsToVideoSec } from '../../timeline/video';
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

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);

    this.video = null;
    this.seekOnReady = false;

    this.state = {
      src: null,
      videoError: null,
      isBuffering: true,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);

    const { loop } = this.props;
    if (loop?.startTime !== prevProps.loop?.startTime || loop?.duration !== prevProps.loop?.duration) {
      this.seekToLoopStart();
    }
  }

  componentWillUnmount() {
    if (this.video) {
      this.video.removeEventListener('timeupdate', this.onTimeUpdate);
      this.video.removeEventListener('canplay', this.onVideoResume);
      setVideoElement(null);
    }
  }

  onPlayerReady(player) {
    const { onAudioStatusChange } = this.props;
    const videoElement = player.getInternalPlayer();
    this.video = videoElement;
    videoElement.addEventListener('timeupdate', this.onTimeUpdate);
    videoElement.addEventListener('canplay', this.onVideoResume);
    setVideoElement(videoElement);
    // native HLS (iOS) calls onReady on every canplay, so only seek once per source
    if (this.seekOnReady) {
      this.seekOnReady = false;
      this.seekToLoopStart();
    }

    if (!onAudioStatusChange) {
      return;
    }
    if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
      if (videoElement.audioTracks?.length > 0) {
        onAudioStatusChange(true);
      }
    } else { // on other platforms, inspect audio tracks before hls.js changes things
      player.getInternalPlayer('hls')?.on('hlsBufferCodecs', (event, data) => {
        onAudioStatusChange(!!data.audio);
      });
    }
  }

  onVideoBuffering() {
    if (!this.state.isBuffering) {
      this.setState({ isBuffering: true });
    }
  }

  onVideoResume() {
    if (this.state.isBuffering || this.state.videoError) {
      this.setState({ isBuffering: false, videoError: null });
    }
  }

  // keep playback inside the selected loop
  onTimeUpdate() {
    const { loop, currentRoute } = this.props;
    const videoElement = this.video;
    if (!loop?.startTime || !videoElement) {
      return;
    }
    const { currentTime } = videoElement;
    if (currentTime < routeMsToVideoSec(currentRoute, loop.startTime)
      || currentTime > routeMsToVideoSec(currentRoute, loop.startTime + loop.duration)) {
      this.seekToLoopStart();
    }
  }

  /**
   * @param {Error|string} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    const err = e === 'hlsError' ? data : e;
    if (!err || err.name === 'AbortError') {
      return;
    }
    if (err.type === 'mediaError' && (err.details === 'bufferStalledError' || err.details === 'bufferNudgeOnStall')) {
      // stalled while buffering, not an error
      this.onVideoBuffering();
      return;
    }

    let videoError = 'Unable to load video';
    if (err.response?.code === 404) {
      videoError = 'This video segment has not uploaded yet or has been deleted.';
    } else if (err.type === 'networkError') {
      videoError = 'Unable to load video. Check network connection.';
    }
    console.error('Video error', { e, data });
    this.setState({ videoError });
  }

  seekToLoopStart() {
    const { loop, currentRoute } = this.props;
    if (this.video && loop) {
      this.video.currentTime = routeMsToVideoSec(currentRoute, loop.startTime);
    }
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

    if (src === '' || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      this.seekOnReady = true;
      this.setState({
        src: api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig),
        videoError: null,
        isBuffering: true,
      });
    }
  }

  render() {
    const { currentRoute, isMuted } = this.props;
    const { src, videoError, isBuffering } = this.state;

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBuffering} error={videoError} />
        <ReactPlayer
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute)}
          onReady={this.onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onSeek={this.onVideoResume}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
