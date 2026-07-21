/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player/file';

import { video as Video } from '@commaai/api';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { bufferVideo, setPlaybackSpeed, resetPlayback, play, pause, seek } from '../../timeline/playback';
import { setVideoPlayer, seekVideoPlayer, getVideoPlayerCurrentTime } from '../../timeline/videoPlayer';
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

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoBufferEnd = this.onVideoBufferEnd.bind(this);
    this.onVideoPlay = this.onVideoPlay.bind(this);
    this.onVideoPause = this.onVideoPause.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoPlaybackRateChange = this.onVideoPlaybackRateChange.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.firstSeek = true;

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    const { dispatch } = this.props;
    dispatch(resetPlayback());
    setVideoPlayer(this.videoPlayer.current);
    if (this.videoPlayer.current) {
      const internal = this.videoPlayer.current.getInternalPlayer();
      if (internal) {
        internal.playbackRate = 1;
      }
    }
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    const videoPlayer = this.videoPlayer.current;
    setVideoPlayer(videoPlayer);
    this.updateVideoSource(prevProps);
  }

  componentWillUnmount() {
    setVideoPlayer(null);
  }

  onVideoBuffering() {
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));
  }

  onVideoBufferEnd() {
    const { dispatch } = this.props;
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
    dispatch(bufferVideo(false));
  }
  
  onVideoPlay() {
    const { dispatch } = this.props;
    dispatch(play());
    dispatch(bufferVideo(false));
  }

  onVideoPause() {
    const { dispatch } = this.props;
    dispatch(pause());
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
      this.setState({ videoError: e.message });
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
      // autoplay was blocked (e.g. iOS after backgrounding/returning to the app)
      const { dispatch } = this.props;
      dispatch(bufferVideo(false));
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
      : (e.response?.text || e.message || 'Unable to load video');
    this.setState({ videoError });
  }

  onVideoPlaybackRateChange(rate) {
    const { dispatch } = this.props;
    dispatch(setPlaybackSpeed(rate));
  }

  onTimeUpdate(event) {
    const { currentRoute, loop, dispatch } = this.props;
    if (!currentRoute) {
      return;
    }
    
    const videoTime = getVideoPlayerCurrentTime(currentRoute);
    if (videoTime >= loop.startTime + loop.duration) {
      seekVideoPlayer(loop.startTime, currentRoute);
      return;
    } else if (videoTime < loop.startTime) {
      seekVideoPlayer(loop.startTime, currentRoute);
      return;
    }
    
    dispatch(seek(videoTime));
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
      src = Video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.setState({ src, videoError: null });
      this.firstSeek = true;
    }
  }

  currentVideoTime(offset = this.props.offset) {
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
    const { isPlaying, isBufferingVideo, currentRoute, onAudioStatusChange, isMuted } = this.props;
    const { src, videoError } = this.state;

    const onPlayerReady = (player) => {
      if (this.firstSeek) {
        const video = player.getInternalPlayer();
        const startSeconds = this.currentVideoTime(
          this.props.loop?.startTime || 0
        );
        video.currentTime = startSeconds;
        this.firstSeek = false;
      }
      
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
      <div>
        <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
          <VideoOverlay loading={isBufferingVideo} error={videoError} />
          <ReactPlayer
            ref={this.videoPlayer}
            url={src}
            playsinline
            muted={isMuted}
            width="100%"
            height="100%"
            config={{
              hlsVersion: '1.4.8',
              hlsOptions: {
                maxBufferLength: 40,
              },
            }}
            playing={Boolean(currentRoute && isPlaying)}
            onReady={onPlayerReady}
            onTimeUpdate={this.onTimeUpdate}
            onBuffer={this.onVideoBuffering}
            onBufferEnd={this.onVideoBufferEnd}
            onPlaying={this.onVideoPlay}
            onPause={this.onVideoPause}
            onPlaybackRateChange={this.onVideoPlaybackRateChange}
            onError={this.onVideoError}
          />
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  isPlaying: 'isPlaying',
  offset: 'offset',
  isBufferingVideo: 'isBufferingVideo',
  routes: 'routes',
  currentRoute: 'currentRoute',
  loop: 'loop',
});

export default connect(stateToProps)(DriveVideo);
