import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { bufferVideo, selectionHasVideo } from '../../timeline/playback';
import { bindVideo, seekPending, seekVideo, videoOffset } from '../../timeline/video';
import { isIos } from '../../utils/browser.js';

const ABORT_ERROR = 'AbortError';
const HLS_ERROR = 'hlsError';
const NETWORK_ERROR = 'networkError';
const NOT_FOUND = 404;

const MISSING_SEGMENT = 'This video segment has not uploaded yet or has been deleted.';
const OFFLINE = 'Unable to load video. Check network connection.';
const UNAVAILABLE = 'Unable to load video';
const NO_VIDEO = 'No video is available in this selected range.';

const RETRY = 'Retry';
const retryButton = 'rounded-full bg-white/15 px-4 py-1.5 text-sm text-white transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-white/25';

const VideoOverlay = ({ loading, error, onRetry }) => {
  if (!loading && !error) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 text-white transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]">
      {error ? (
        <div role={onRetry ? 'alert' : 'status'} className="flex flex-col items-center px-6 text-center">
          <ErrorOutline className="mb-2" />
          <Typography>{error}</Typography>
          {onRetry && (
            <button type="button" onClick={onRetry} className={`mt-3 ${retryButton}`}>
              {RETRY}
            </button>
          )}
        </div>
      ) : (
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={42} />
      )}
    </div>
  );
};

function playbackRate(speed) {
  if (isIos() || !(speed > 0)) return 1;
  return speed;
}

function videoMessage(error) {
  if (error.response?.code === NOT_FOUND) return MISSING_SEGMENT;
  if (error.type === NETWORK_ERROR) return OFFLINE;
  return error.response?.text || UNAVAILABLE;
}

function loopBounds(loop) {
  if (loop?.startTime == null || !loop.duration) return null;
  return { start: loop.startTime, end: loop.startTime + loop.duration };
}

class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.player = React.createRef();
    this.onReady = this.onReady.bind(this);
    this.onBuffer = this.onBuffer.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onError = this.onError.bind(this);
    this.retry = this.retry.bind(this);
    this.state = { src: null, videoError: null, retry: 0 };
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
    this.reportRange(null);
  }

  componentDidUpdate(prev) {
    this.updateSource(prev);
    const routeChanged = prev.currentRoute?.fullname !== this.props.currentRoute?.fullname;
    const offsetChanged = prev.offset !== this.props.offset;
    const loopChanged = prev.loop?.startTime !== this.props.loop?.startTime
      || prev.loop?.duration !== this.props.loop?.duration;
    if (routeChanged || offsetChanged) this.seekToCommand();
    else if (loopChanged) this.seekInsideLoop();
    this.reportRange(prev);
  }

  componentWillUnmount() {
    this.mounted = false;
    this.reportStatus(null);
    bindVideo(null);
    cancelAnimationFrame(this.frame);
  }

  reportStatus(message, recoverable = true) {
    if (!message) {
      this.props.onPlaybackStatusChange?.(null);
      return;
    }
    this.props.onPlaybackStatusChange?.({ message, recover: recoverable ? this.retry : null });
  }

  reportRange(prev) {
    const empty = !selectionHasVideo(this.props.currentRoute, this.props.loop);
    const wasEmpty = prev ? !selectionHasVideo(prev.currentRoute, prev.loop) : false;
    if (prev && empty === wasEmpty) return;
    if (!prev && !empty) return;
    if (empty) {
      this.setBuffering(false);
      if (this.state.videoError) this.setState({ videoError: null });
      this.reportStatus(NO_VIDEO, false);
      return;
    }
    this.reportStatus(this.state.videoError);
  }

  onReady(player) {
    bindVideo(player.getInternalPlayer());
    this.watchAudio(player);
    this.seekToCommand();
  }

  onBuffer() {
    if (this.props.desiredPlaySpeed > 0) this.setBuffering(true);
  }

  onPlaying() {
    this.setBuffering(false);
    if (!this.mounted || !this.state.videoError) return;
    this.setState({ videoError: null }, () => this.reportStatus(null));
  }

  onError(error, data) {
    if (!this.mounted || !error || error.name === ABORT_ERROR) return;
    const info = error === HLS_ERROR ? data : error;
    if (!info || info.fatal === false) return;

    const message = videoMessage(info);
    this.setBuffering(false);
    this.setState({ videoError: message }, () => this.reportStatus(message));
  }

  retry() {
    this.setState((state) => ({ retry: state.retry + 1, videoError: null }), () => this.reportStatus(null));
  }

  setBuffering(buffering) {
    if (this.props.isBufferingVideo !== buffering) {
      this.props.dispatch(bufferVideo(buffering));
    }
  }

  updateSource(prev) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (this.state.src) this.setState({ src: null, videoError: null }, () => this.reportStatus(null));
      return;
    }
    if (!prev.currentRoute || prev.currentRoute.fullname !== currentRoute.fullname) {
      const src = api.video.getQcameraStreamUrl(
        currentRoute.fullname,
        currentRoute.share_exp,
        currentRoute.share_sig,
      );
      this.setState({ src, videoError: null }, () => this.reportStatus(null));
    }
  }

  seekToCommand() {
    const { offset, loop, currentRoute } = this.props;
    const bounds = loopBounds(loop);
    if (!bounds) {
      seekVideo(offset ?? 0, currentRoute);
      return;
    }
    const outside = offset == null || offset < bounds.start || offset > bounds.end;
    seekVideo(outside ? bounds.start : offset, currentRoute);
  }

  seekInsideLoop() {
    const { loop, currentRoute, offset } = this.props;
    const bounds = loopBounds(loop);
    if (!bounds) return;
    const position = videoOffset(currentRoute) ?? offset;
    if (position == null || position < bounds.start || position >= bounds.end) {
      seekVideo(bounds.start, currentRoute);
    }
  }

  holdLoop() {
    const { loop, currentRoute, desiredPlaySpeed } = this.props;
    const bounds = loopBounds(loop);
    const element = this.player.current?.getInternalPlayer?.();
    if (!element || desiredPlaySpeed <= 0 || seekPending() || !bounds) return;
    const offset = videoOffset(currentRoute);
    if ((offset == null || offset < bounds.end) && !element.ended) return;
    seekVideo(bounds.start, currentRoute);
    if (element.paused) element.play()?.catch(() => {});
  }

  watchAudio(player) {
    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) return;
    if (isIos()) {
      const element = player.getInternalPlayer();
      onAudioStatusChange(Boolean(element?.audioTracks?.length));
      return;
    }
    player.getInternalPlayer('hls')?.on('hlsBufferCodecs', (_event, data) => {
      onAudioStatusChange(Boolean(data.audio));
    });
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, isMuted, currentRoute } = this.props;
    const { src, videoError, retry } = this.state;
    const empty = !selectionHasVideo(currentRoute, this.props.loop);
    const playing = Boolean(currentRoute && desiredPlaySpeed > 0 && !empty);
    const notice = empty ? NO_VIDEO : videoError;

    return (
      <div className="relative h-full w-full">
        {src && !empty && (
          <ReactPlayer
            key={retry}
            ref={this.player}
            url={src}
            width="100%"
            height="100%"
            playsinline
            muted={isMuted}
            playing={playing}
            playbackRate={playbackRate(desiredPlaySpeed)}
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
        <VideoOverlay loading={!empty && isBufferingVideo && !videoError} error={notice} onRetry={empty ? null : this.retry} />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
