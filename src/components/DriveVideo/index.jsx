/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import {
  bufferVideo,
  videoProgress,
} from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const DEBUG = true;

function debug(...args) {
  if (DEBUG) {
    console.debug('[DriveVideo]', ...args);
  }
}

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
    content = (
      <CircularProgress
        style={{ color: Colors.white }}
        thickness={4}
        size={50}
      />
    );
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

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.updateVideoSource = this.updateVideoSource.bind(this);

    this.videoPlayer = React.createRef();

    this.firstSeek = true;
    this.lastVideoOffset = null;

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    debug('componentDidMount', {
      offset: this.props.offset,
      desiredPlaySpeed: this.props.desiredPlaySpeed,
      currentRoute: this.props.currentRoute,
    });

    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    const {
      offset,
      desiredPlaySpeed,
      currentRoute,
    } = this.props;

    debug('componentDidUpdate', {
      previousOffset: prevProps.offset,
      currentOffset: offset,
      previousSpeed: prevProps.desiredPlaySpeed,
      currentSpeed: desiredPlaySpeed,
      routeChanged: prevProps.currentRoute !== currentRoute,
    });

    this.updateVideoSource(prevProps);

    if (
      currentRoute &&
      offset !== null &&
      offset !== prevProps.offset &&
      this.videoPlayer.current &&
      (
        this.lastVideoOffset === null ||
        Math.abs(offset - this.lastVideoOffset) > 700
      )
    ) {
      const videoTime = this.currentVideoTime(offset);

      debug('seeking video from Redux state', {
        offset,
        videoTime,
        previousVideoOffset: this.lastVideoOffset,
      });

      this.videoPlayer.current.seekTo(videoTime, 'seconds');
      this.lastVideoOffset = offset;
    }

    if (desiredPlaySpeed !== prevProps.desiredPlaySpeed) {
      debug('playback speed changed', {
        previous: prevProps.desiredPlaySpeed,
        current: desiredPlaySpeed,
      });
    }
  }

  componentWillUnmount() {
    debug('componentWillUnmount');
  }

  onPlayerReady(player) {
    const {
      currentRoute,
      onAudioStatusChange,
      offset,
    } = this.props;

    debug('player ready', {
      offset,
      currentRoute,
      player,
    });

    if (currentRoute && offset !== null) {
      const videoTime = this.currentVideoTime(offset);

      debug('initial video seek', {
        offset,
        videoTime,
      });

      player.seekTo(videoTime, 'seconds');
      this.lastVideoOffset = offset;
    }

    if (isIos()) {
      const videoElement = player.getInternalPlayer();

      debug('checking iOS audio tracks', {
        hasVideoElement: Boolean(videoElement),
        audioTracksLength: videoElement?.audioTracks?.length,
      });

      if (
        videoElement &&
        videoElement.audioTracks &&
        videoElement.audioTracks.length > 0
      ) {
        if (onAudioStatusChange) {
          onAudioStatusChange(true);
        }
      }
    } else {
      const hlsPlayer = player.getInternalPlayer('hls');

      debug('checking HLS audio tracks', {
        hasHlsPlayer: Boolean(hlsPlayer),
      });

      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          debug('HLS buffer codecs', data);

          if (onAudioStatusChange) {
            onAudioStatusChange(!!data.audio);
          }
        });
      }
    }
  }

  onVideoBuffering() {
    const {
      dispatch,
      currentRoute,
    } = this.props;

    const videoPlayer = this.videoPlayer.current;

    debug('video buffering event', {
      hasPlayer: Boolean(videoPlayer),
      hasRoute: Boolean(currentRoute),
    });

    if (!videoPlayer || !currentRoute || !videoPlayer.getDuration()) {
      dispatch(bufferVideo(true));
      return;
    }

    if (this.firstSeek) {
      this.firstSeek = false;

      debug('first video seek', {
        videoTime: this.currentVideoTime(),
      });

      videoPlayer.seekTo(this.currentVideoTime(), 'seconds');
    }

    const { hasLoaded } = getVideoState(videoPlayer);
    const { readyState } = videoPlayer.getInternalPlayer();

    debug('video buffering state', {
      hasLoaded,
      readyState,
    });

    if (!hasLoaded || readyState < 2) {
      dispatch(bufferVideo(true));
    }
  }

  onVideoProgress(progress) {
    const {
      currentRoute,
      dispatch,
    } = this.props;

    if (!currentRoute) {
      debug('video progress ignored: no current route', progress);
      return;
    }

    const offset = this.offsetFromVideoTime(progress.playedSeconds);

    debug('video progress', {
      playedSeconds: progress.playedSeconds,
      loadedSeconds: progress.loadedSeconds,
      offset,
      previousReduxOffset: this.props.offset,
      lastVideoOffset: this.lastVideoOffset,
    });

    this.lastVideoOffset = offset;

    dispatch(videoProgress(offset));
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    const { dispatch } = this.props;

    debug('HLS error', e);

    dispatch(bufferVideo(true));

    if (
      e.type === 'mediaError' &&
      (
        e.details === 'bufferStalledError' ||
        e.details === 'bufferNudgeOnStall'
      )
    ) {
      debug('recoverable HLS buffering error');
      return;
    }

    if (e.type === 'networkError' && e.response?.code === 404) {
      this.setState({
        videoError: 'This video segment has not uploaded yet or has been deleted.',
      });
    } else {
      this.setState({
        videoError: 'Unable to load video',
      });
    }
  }

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    debug('video error', {
      error: e,
      data,
    });

    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }

    if (e.name === 'AbortError') {
      return;
    }

    if (
      e.target?.src?.startsWith(window.location.origin) &&
      e.target.src.endsWith('undefined')
    ) {
      console.warn(
        'Video error with undefined src, ignoring',
        { e, data },
      );
      return;
    }

    const { dispatch } = this.props;

    dispatch(bufferVideo(true));

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });

      this.setState({
        videoError: 'Unable to load video. Check network connection.',
      });

      return;
    }

    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');

    this.setState({
      videoError,
    });
  }

  onVideoResume() {
    const { videoError } = this.state;

    debug('video resumed');

    if (videoError) {
      this.setState({
        videoError: null,
      });
    }
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;

    const {
      currentRoute,
    } = this.props;

    if (!currentRoute) {
      debug('no current route, clearing video');

      if (src !== '') {
        this.setState({
          src: '',
          videoError: null,
        });
      }

      return;
    }

    if (
      src === '' ||
      !prevProps.currentRoute ||
      prevProps.currentRoute?.fullname !== currentRoute.fullname
    ) {
      src = api.video.getQcameraStreamUrl(
        currentRoute.fullname,
        currentRoute.share_exp,
        currentRoute.share_sig,
      );

      debug('setting video source', {
        src,
        route: currentRoute.fullname,
      });

      this.setState({
        src,
        videoError: null,
      });

      this.firstSeek = true;
      this.lastVideoOffset = null;
    }
  }

  offsetFromVideoTime(seconds) {
    const {
      currentRoute,
    } = this.props;

    if (!currentRoute) {
      return null;
    }

    return (
      (seconds * 1000) +
      (currentRoute.videoStartOffset || 0)
    );
  }

  currentVideoTime(offset = currentOffset()) {
    const {
      currentRoute,
    } = this.props;

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
    const {
      desiredPlaySpeed,
      isBufferingVideo,
      currentRoute,
      isMuted,
    } = this.props;

    const {
      src,
      videoError,
    } = this.state;

    debug('render', {
      src,
      desiredPlaySpeed,
      isBufferingVideo,
      currentRoute: currentRoute?.fullname,
      offset: this.props.offset,
      isMuted,
      lastVideoOffset: this.lastVideoOffset,
      videoError,
    });

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={isBufferingVideo}
          error={videoError}
        />

        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={this.onPlayerReady}
          onProgress={this.onVideoProgress}
          progressInterval={100}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed}
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