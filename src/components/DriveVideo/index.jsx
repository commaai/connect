/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, videoTime } from '../../timeline/playback';
import { isFirefox } from '../../utils/browser.js';

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
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoSeeked = this.onVideoSeeked.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.ready = false;
    this.pendingSeek = false;

    this.videoPlayer = React.createRef();

    this.state = {
      videoError: null,
    };
  }

  componentDidUpdate(prevProps) {
    if (this.props.currentRoute?.fullname !== prevProps.currentRoute?.fullname) {
      this.ready = false;
      this.pendingSeek = false;
      this.props.onAudioStatusChange?.(false);
      this.props.dispatch(videoTime(null));
      this.setState({ videoError: null });
    }
    if (this.props.seekRevision !== prevProps.seekRevision) {
      this.seekToTimeline();
    }
    if (this.props.loop !== prevProps.loop) {
      this.onVideoProgress();
    }
  }

  componentWillUnmount() {
    this.props.dispatch(videoTime(null));
  }

  onVideoBuffering() {
    // A seek temporarily lowers readyState. Let the media element finish it;
    // pausing here forces an unnecessary audio stop/start even for buffered data.
    if (!this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  onVideoSeeked() {
    this.pendingSeek = false;
    this.onVideoResume();
    this.onVideoProgress();
  }

  onVideoEnded() {
    if (this.props.loop?.duration > 0) {
      this.seekToTimeline(this.props.loop.startTime);
      if (this.props.desiredPlaySpeed) {
        this.videoPlayer.current.getInternalPlayer().play()?.catch(() => {
          this.props.dispatch(pause());
        });
      }
    } else {
      this.props.dispatch(pause());
    }
  }

  seekToTimeline(offset = currentOffset()) {
    if (!this.ready) {
      return;
    }
    const player = this.videoPlayer.current;
    const target = this.currentVideoTime(offset);
    if (Math.abs(player.getCurrentTime() - target) > 0.001) {
      this.pendingSeek = true;
      player.seekTo(target, 'seconds');
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

    if (e.name === 'NotAllowedError') {
      // Autoplay denial needs a user gesture, not a buffering/error overlay.
      this.setState({ videoError: null });
      this.props.dispatch(pause());
      this.props.dispatch(bufferVideo(false));
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
    if (videoError) {
      this.setState({ videoError: null });
    }
    if (this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(false));
    }
  }

  onVideoProgress() {
    const { currentRoute, loop, dispatch } = this.props;
    const player = this.videoPlayer.current;
    const media = player?.getInternalPlayer();
    if (!this.ready || !currentRoute || !media || this.pendingSeek || media.seeking) {
      return;
    }

    const offset = player.getCurrentTime() * 1000 + (currentRoute.videoStartOffset || 0);
    if (loop?.startTime != null && loop.duration > 0
        && (offset < loop.startTime - 1 || offset >= loop.startTime + loop.duration)) {
      this.seekToTimeline(loop.startTime);
      return;
    }

    // The media clock already accounts for buffering, playback speed, and the
    // audio output device. The timeline follows it, never the other way around.
    if (this.props.videoTime !== offset) {
      // Native HLS can report waiting on a rate change without a matching
      // playing event. Advancing, ready media is no longer buffering.
      if (this.props.videoTime != null && this.props.isBufferingVideo && !media.paused && media.readyState >= 2) {
        dispatch(bufferVideo(false));
      }
      dispatch(videoTime(offset));
    }
  }

  currentVideoTime(offset = currentOffset()) {
    return Math.max(0, (offset - (this.props.currentRoute?.videoStartOffset || 0)) / 1000);
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, onAudioStatusChange, isMuted } = this.props;
    const { videoError } = this.state;
    const src = currentRoute && api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

    const onPlayerReady = (player) => {
      if (!this.ready) {
        this.ready = true;
        this.seekToTimeline();
      }
      const videoElement = player.getInternalPlayer();
      const hlsPlayer = player.getInternalPlayer('hls');
      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          onAudioStatusChange?.(!!data.audio);
        });
      } else if (videoElement?.audioTracks?.length > 0) {
        // Keep detected audio available until the route changes, even if a later
        // native HLS readiness event exposes an empty track list.
        onAudioStatusChange?.(true);
      }
    };

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          key={currentRoute?.fullname}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={onPlayerReady}
          onProgress={this.onVideoProgress}
          progressInterval={100}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed || 1)}
          onSeek={this.onVideoSeeked}
          onEnded={this.onVideoEnded}
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
  videoTime: state.videoTime,
  seekRevision: state.seekRevision,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
