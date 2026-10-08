/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, bufferVideo, videoProgress } from '../../timeline/playback';
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
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onPlayerSeek = this.onPlayerSeek.bind(this);
    this.appliedSeekRevision = null;
    this.seekPending = false;
    this.ready = false;

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.updateVideoSource();
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource();
    if (prevProps.loop !== this.props.loop && this.props.loop?.duration > 0
      && (this.props.offset < this.props.loop.startTime
        || this.props.offset > this.props.loop.startTime + this.props.loop.duration)) {
      this.props.dispatch(seek(this.props.loop.startTime));
    }
    if (prevProps.seekRevision !== this.props.seekRevision) this.applyPendingSeek();
  }

  onVideoBuffering() {
    this.props.dispatch(bufferVideo(true));
  }

  applyPendingSeek() {
    const player = this.videoPlayer.current;
    if (!this.ready || !player) return;
    if (this.appliedSeekRevision === this.props.seekRevision) return;
    this.appliedSeekRevision = this.props.seekRevision;
    this.seekPending = true;
    const target = this.currentVideoTime(this.props.offset ?? 0);
    if (Math.abs(player.getCurrentTime() - target) < 0.03) {
      this.seekPending = false;
    } else {
      player.seekTo(target, 'seconds');
    }
  }

  onPlayerReady(player) {
    this.ready = true;
    this.applyPendingSeek();
    const { onAudioStatusChange } = this.props;
    if (isIos()) {
      if (player.getInternalPlayer()?.audioTracks?.length && onAudioStatusChange) onAudioStatusChange(true);
    } else {
      const hls = player.getInternalPlayer('hls');
      if (hls && onAudioStatusChange) {
        // ReactPlayer owns the HLS lifetime. Avoid accumulating callbacks on repeated ready events.
        if (this.audioHls && this.audioHls !== hls && this.audioHandler) this.audioHls.off('hlsBufferCodecs', this.audioHandler);
        if (this.audioHls !== hls) {
          this.audioHls = hls;
          this.audioHandler = (_event, data) => onAudioStatusChange(!!data.audio);
          hls.on('hlsBufferCodecs', this.audioHandler);
        }
      }
    }
  }

  componentWillUnmount() {
    if (this.audioHls && this.audioHandler) this.audioHls.off('hlsBufferCodecs', this.audioHandler);
  }

  onPlayerSeek() {
    this.seekPending = false;
    this.onVideoProgress();
  }

  onVideoProgress() {
    const player = this.videoPlayer.current;
    if (!player || !this.ready || this.seekPending || !this.props.currentRoute) return;
    const mediaSeconds = player.getCurrentTime();
    if (!Number.isFinite(mediaSeconds)) return;
    const routeOffset = Math.max(0, mediaSeconds * 1000 + (this.props.currentRoute.videoStartOffset || 0));
    const { loop, desiredPlaySpeed, seekRevision, dispatch } = this.props;
    if (loop && loop.duration > 0 && routeOffset >= loop.startTime + loop.duration && desiredPlaySpeed > 0) {
      dispatch(seek(loop.startTime));
      return;
    }
    dispatch(videoProgress(routeOffset, seekRevision));
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

  updateVideoSource() {
    const { currentRoute } = this.props;
    const nextSrc = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : '';
    // Refresh the source even if the route identifier remains unchanged but its signed URL rotates.
    if (nextSrc !== this.state.src) {
      this.ready = false;
      this.seekPending = false;
      this.appliedSeekRevision = null;
      if (this.audioHls && this.audioHandler) this.audioHls.off('hlsBufferCodecs', this.audioHandler);
      this.audioHls = null;
      this.audioHandler = null;
      this.setState({ src: nextSrc, videoError: null });
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
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          ref={this.videoPlayer}
          key={src}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={this.onPlayerReady}
          onProgress={this.onVideoProgress}
          progressInterval={100}
          onSeek={this.onPlayerSeek}
          onEnded={this.onVideoProgress}
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
  seekRevision: state.seekRevision || 0,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  routes: state.routes,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
