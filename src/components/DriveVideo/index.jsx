import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { bufferVideo } from '../../timeline/playback';
import { bindVideo, seekPending, seekVideo } from '../../timeline/video';
import { isFirefox, isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error }) => {
  if (!loading && !error) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#16181A]/70 text-white transition-opacity duration-150">
      {error ? (
        <div className="flex flex-col items-center px-6 text-center">
          <ErrorOutline className="mb-2" />
          <Typography>{error}</Typography>
        </div>
      ) : (
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={42} />
      )}
    </div>
  );
};

function playbackRate(speed, muted) {
  if (isIos() || !(speed > 0)) return 1;
  return Math.min(isFirefox() && !muted ? 8 : 16, speed);
}

class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.player = React.createRef();
    this.onReady = this.onReady.bind(this);
    this.onBuffer = this.onBuffer.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onError = this.onError.bind(this);
    this.state = { src: null, videoError: null };
    this.rate = 1;
  }

  componentDidMount() {
    this.mounted = true;
    const tick = () => {
      if (!this.mounted) return;
      this.holdLoop();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    this.updateSource({});
  }

  componentDidUpdate(prev) {
    this.updateSource(prev);
    const routeChanged = prev.currentRoute?.fullname !== this.props.currentRoute?.fullname;
    const offsetChanged = prev.offset !== this.props.offset;
    const loopChanged = prev.loop?.startTime !== this.props.loop?.startTime
      || prev.loop?.duration !== this.props.loop?.duration;
    if (routeChanged || offsetChanged) this.seekToCommand();
    else if (loopChanged) this.seekInsideLoop();
  }

  componentWillUnmount() {
    this.mounted = false;
    bindVideo(null);
    clearTimeout(this.loadingTimer);
    cancelAnimationFrame(this.frame);
  }

  onReady(player) {
    bindVideo(player.getInternalPlayer());
    this.watchAudio(player);
    this.seekToCommand();
  }

  onBuffer() {
    if (this.props.desiredPlaySpeed <= 0 || this.props.isBufferingVideo) return;
    clearTimeout(this.loadingTimer);
    this.loadingTimer = setTimeout(() => {
      if (this.mounted) this.setBuffering(true);
    }, 180);
  }

  onPlaying() {
    clearTimeout(this.loadingTimer);
    this.setBuffering(false);
    if (this.state.videoError) this.setState({ videoError: null });
  }

  onError(error, data) {
    if (!error || error.name === 'AbortError') return;
    if (error === 'hlsError') {
      this.onHlsError(data);
      return;
    }
    const src = error.target?.src;
    if (src && src.startsWith(window.location.origin) && src.endsWith('undefined')) return;

    clearTimeout(this.loadingTimer);
    this.setBuffering(false);
    if (error.type === 'networkError') {
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }
    const missing = error.response?.code === 404;
    this.setState({
      videoError: missing
        ? 'This video segment has not uploaded yet or has been deleted.'
        : (error.response?.text || 'Unable to load video'),
    });
  }

  onHlsError(data) {
    if (!data || data.fatal === false) return;
    if (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall') return;
    clearTimeout(this.loadingTimer);
    this.setBuffering(false);
    const missing = data.type === 'networkError' && data.response?.code === 404;
    this.setState({
      videoError: missing
        ? 'This video segment has not uploaded yet or has been deleted.'
        : 'Unable to load video',
    });
  }

  setBuffering(buffering) {
    if (this.props.isBufferingVideo !== buffering) {
      this.props.dispatch(bufferVideo(buffering));
    }
  }

  updateSource(prev) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (this.state.src) this.setState({ src: null, videoError: null });
      return;
    }
    if (!prev.currentRoute || prev.currentRoute.fullname !== currentRoute.fullname) {
      const src = api.video.getQcameraStreamUrl(
        currentRoute.fullname,
        currentRoute.share_exp,
        currentRoute.share_sig,
      );
      this.setState({ src, videoError: null });
    }
  }

  // Playhead command: a user seek, a new route, or the stored offset.
  seekToCommand() {
    const { offset, loop, currentRoute } = this.props;
    seekVideo(commandOffset(offset, loop), currentRoute);
  }

  // A new loop should not yank the video back if it is already inside it.
  seekInsideLoop() {
    const { loop, currentRoute, offset } = this.props;
    if (loop?.startTime == null || !loop.duration) return;
    const played = this.playedOffset();
    const position = played == null ? offset : played;
    const end = loop.startTime + loop.duration;
    if (position == null || position < loop.startTime || position >= end) {
      seekVideo(loop.startTime, currentRoute);
    }
  }

  playedOffset() {
    const video = this.player.current?.getInternalPlayer?.();
    if (!video || video.readyState < 1 || !Number.isFinite(video.currentTime)) return null;
    return (this.props.currentRoute?.videoStartOffset || 0) + video.currentTime * 1000;
  }

  holdLoop() {
    const { loop, currentRoute, desiredPlaySpeed } = this.props;
    const video = this.player.current?.getInternalPlayer?.();
    if (!video || desiredPlaySpeed <= 0 || seekPending() || loop?.startTime == null || !loop.duration) return;
    const offset = (currentRoute?.videoStartOffset || 0) + video.currentTime * 1000;
    if (offset < loop.startTime + loop.duration && !video.ended) return;
    seekVideo(loop.startTime, currentRoute);
    if (video.paused) {
      const pending = video.play();
      if (pending) pending.catch(() => {});
    }
  }

  watchAudio(player) {
    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) return;
    if (isIos()) {
      const video = player.getInternalPlayer();
      onAudioStatusChange(Boolean(video?.audioTracks?.length));
      return;
    }
    player.getInternalPlayer('hls')?.on('hlsBufferCodecs', (_event, data) => {
      onAudioStatusChange(Boolean(data.audio));
    });
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, isMuted, currentRoute } = this.props;
    const { src, videoError } = this.state;
    if (desiredPlaySpeed > 0) this.rate = playbackRate(desiredPlaySpeed, isMuted);
    const playing = Boolean(currentRoute && desiredPlaySpeed > 0);

    return (
      <div className="relative m-[0_auto] aspect-[1.593] min-h-[200px] max-w-[964px] overflow-hidden rounded-lg bg-black">
        <VideoOverlay loading={isBufferingVideo && !videoError} error={videoError} />
        {src && (
          <ReactPlayer
            ref={this.player}
            url={src}
            width="100%"
            height="100%"
            playsinline
            muted={isMuted}
            playing={playing}
            playbackRate={this.rate}
            onReady={this.onReady}
            onBuffer={this.onBuffer}
            onBufferEnd={this.onPlaying}
            onPlay={this.onPlaying}
            onError={this.onError}
            config={{
              hlsVersion: '1.4.8',
              hlsOptions: { maxBufferLength: 30, backBufferLength: 30 },
            }}
          />
        )}
      </div>
    );
  }
}

function commandOffset(offset, loop) {
  if (loop?.startTime == null || !loop.duration) return offset ?? 0;
  const end = loop.startTime + loop.duration;
  if (offset == null || offset < loop.startTime || offset > end) return loop.startTime;
  return offset;
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
