/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player/file';

import { video as Video } from '@commaai/api';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, bufferVideo, pause, play } from '../../timeline/playback';
import { setVideoPlayer } from '../../timeline/videoPlayer';
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
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoPause = this.onVideoPause.bind(this);
    this.onVideoPlaybackRateChange = this.onVideoPlaybackRateChange.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.firstSeek = true;

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    setVideoPlayer(this.videoPlayer.current);
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    setVideoPlayer(this.videoPlayer.current);
    this.updateVideoSource(prevProps);

    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }
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
      dispatch(pause());
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

  onVideoResume() {
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });

    const { dispatch } = this.props;
    const internal = this.videoPlayer.current?.getInternalPlayer?.();
    dispatch(play(internal?.playbackRate || 1));
  }

  onVideoPause() {
    const { dispatch } = this.props;
    dispatch(pause());
  }

  onVideoPlaybackRateChange(rate) {
    const { dispatch } = this.props;
    dispatch(play(rate));
  }

  onVideoEnded() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (desiredPlaySpeed > 0) {
      dispatch(pause());
    }
  }

  onTimeUpdate(event) {
    const { currentRoute, dispatch } = this.props;
    if (!currentRoute) {
      return;
    }

    const videoTime = event.target.currentTime;
    if (typeof videoTime !== 'number' || Number.isNaN(videoTime)) {
      return;
    }

    const videoStartOffset = currentRoute.videoStartOffset || 0;
    dispatch(seek(videoTime * 1000 + videoStartOffset));
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
          onTimeUpdate={this.onTimeUpdate}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoBufferEnd}
          onPlay={this.onVideoResume}
          onPause={this.onVideoPause}
          onPlaybackRateChange={this.onVideoPlaybackRateChange}
          onEnded={this.onVideoEnded}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  desiredPlaySpeed: 'desiredPlaySpeed',
  offset: 'offset',
  startTime: 'startTime',
  isBufferingVideo: 'isBufferingVideo',
  routes: 'routes',
  currentRoute: 'currentRoute',
});

export default connect(stateToProps)(DriveVideo);
