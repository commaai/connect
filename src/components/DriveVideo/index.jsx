/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, setVideoClock } from '../../timeline';
import { seek, pause, bufferVideo } from '../../timeline/playback';
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
    this.syncVideo = this.syncVideo.bind(this);
    this.onVideoSeek = this.onVideoSeek.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.pendingSeek = currentOffset(props);

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.detachClock = setVideoClock((state) => {
      if (state.currentRoute?.fullname !== this.props.currentRoute?.fullname) return null;
      if (state.seekRequest !== this.props.seekRequest) return state.seekRequest?.offset ?? state.offset;
      const video = this.videoPlayer.current?.getInternalPlayer();
      return this.pendingSeek ?? (video ? video.currentTime * 1000 + (this.props.currentRoute?.videoStartOffset || 0) : state.offset);
    });
    this.updateVideoSource({});
    this.videoSyncIntv = setInterval(this.syncVideo, 500);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.pendingSeek = this.props.zoom?.start ?? 0;
    } else if (prevProps.seekRequest !== this.props.seekRequest) {
      this.pendingSeek = this.props.seekRequest.offset;
    } else if (prevProps.loop !== this.props.loop) {
      this.pendingSeek = currentOffset(this.props);
    }
    this.updateVideoSource(prevProps);
    this.syncVideo();
  }

  componentWillUnmount() {
    const offset = currentOffset(this.props);
    this.detachClock();
    this.props.dispatch(seek(offset));
    this.props.dispatch(bufferVideo(false));
    if (this.videoSyncIntv) {
      clearTimeout(this.videoSyncIntv);
      this.videoSyncIntv = null;
    }
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
    if (!e?.fatal) return;
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
    this.syncVideo();
  }

  onVideoSeek() {
    const video = this.videoPlayer.current?.getInternalPlayer();
    if (!video || video.seeking) return;
    const target = Math.min(video.duration, this.currentVideoTime(this.pendingSeek));
    if (this.pendingSeek != null && Math.abs(video.currentTime - target) >= 0.01) {
      this.syncVideo();
      return;
    }
    this.pendingSeek = null;
    this.syncVideo();
  }

  onVideoEnded() {
    const { dispatch, loop, zoom, currentRoute } = this.props;
    if (loop?.duration > 0 && zoom && (zoom.start > 0 || zoom.end < currentRoute.duration)) {
      dispatch(seek(loop.startTime));
    } else dispatch(pause());
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
      this.playerReady = false;
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.setState({ src, videoError: null });
    }
  }

  syncVideo() {
    const { dispatch, isBufferingVideo, isMuted } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!this.playerReady || !videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    let { desiredPlaySpeed: newPlaybackRate } = this.props;
    const internalPlayer = videoPlayer.getInternalPlayer();
    if (this.pendingSeek != null && !internalPlayer.seeking) {
      const target = Math.min(videoPlayer.getDuration(), this.currentVideoTime(this.pendingSeek));
      if (Math.abs(target - videoPlayer.getCurrentTime()) >= 0.01) {
        videoPlayer.seekTo(target, 'seconds');
        return;
      }
      this.pendingSeek = null;
    }
    // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x
    newPlaybackRate = Math.max(0, Math.min((isFirefox() && !isMuted) ? 8 : 16, newPlaybackRate));

    const { hasLoaded } = getVideoState(videoPlayer);
    const buffering = internalPlayer.seeking || internalPlayer.readyState < 2 || (newPlaybackRate > 0 && !hasLoaded);
    if (isBufferingVideo !== buffering) dispatch(bufferVideo(buffering));
    if (buffering) newPlaybackRate = 0; // in some circumstances, iOS won't update readyState unless temporarily paused

    if (!internalPlayer.paused && newPlaybackRate === 0) {
      internalPlayer.pause();
    } else if (internalPlayer.playbackRate !== newPlaybackRate && newPlaybackRate !== 0) {
      internalPlayer.playbackRate = newPlaybackRate;
    }
    if (internalPlayer.paused && newPlaybackRate !== 0) {
      const playRes = internalPlayer.play();
      if (playRes) {
        playRes.catch(() => console.debug('[DriveVideo] play interrupted by pause'));
      }
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
      this.playerReady = true;
      this.syncVideo();
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
          playbackRate={desiredPlaySpeed || 1}
          onSeek={this.onVideoSeek}
          onEnded={this.onVideoEnded}
          onProgress={() => {
            const video = this.videoPlayer.current?.getInternalPlayer();
            const { loop } = this.props;
            if (video && !video.paused && this.pendingSeek == null && loop?.duration > 0
              && video.currentTime * 1000 + (currentRoute?.videoStartOffset || 0) >= loop.startTime + loop.duration) this.onVideoEnded();
          }}
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
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  startTime: state.startTime,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  seekRequest: state.seekRequest,
  loop: state.loop,
  zoom: state.zoom,
});

export default connect(stateToProps)(DriveVideo);
