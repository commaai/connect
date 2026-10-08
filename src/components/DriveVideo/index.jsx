/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, pause, bufferVideo, videoProgress } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const SEEK_TOLERANCE_SECONDS = 1;

// Only connectivity-related failures should be retried when the browser comes back online.
const isTransientNetworkStatus = (code) => {
  if (code == null) return true;
  const status = Number(code);
  return status === 0 || status === 408 || status === 429 || status >= 500;
};

const sourceForRoute = (route) => route
  ? api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig)
  : '';

const routeSourceKey = (route) => JSON.stringify([route?.fullname || null, sourceForRoute(route)]);

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button onClick={onRetry} variant="contained" className="mt-3">Retry video</Button>
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

export class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onPlayerSeek = this.onPlayerSeek.bind(this);
    this.onPlayerEnded = this.onPlayerEnded.bind(this);
    this.onReconnect = this.onReconnect.bind(this);
    this.recoverOnReconnect = false;
    this.appliedSeekRevision = null;
    this.pendingSeek = null;
    this.reseekedRevision = null;
    this.bufferingAtSeconds = null;
    this.ready = false;
    this.unmounted = false;
    this.retryVideo = this.retryVideo.bind(this);
    this.lastPlaybackRate = props.desiredPlaySpeed > 0 ? props.desiredPlaySpeed : 1;
    this.videoPlayer = React.createRef();

    this.state = {
      videoError: null,
      retryGeneration: 0,
      restartingLoop: false,
    };
  }

  componentDidMount() {
    window.addEventListener('online', this.onReconnect);
  }

  componentDidUpdate(prevProps) {
    if (this.props.desiredPlaySpeed > 0) {
      this.lastPlaybackRate = this.props.desiredPlaySpeed;
    }
    if (routeSourceKey(prevProps.currentRoute) !== routeSourceKey(this.props.currentRoute)) {
      this.props.onAudioStatusChange?.(false);
      this.resetPlayer();
      this.setState({ videoError: null, retryGeneration: 0, restartingLoop: false });
      this.props.dispatch(bufferVideo(true));
    }
    if (prevProps.loop !== this.props.loop && this.props.loop?.duration > 0
      && (this.props.offset < this.props.loop.startTime
        || this.props.offset > this.props.loop.startTime + this.props.loop.duration)) {
      this.props.dispatch(seek(this.props.loop.startTime));
    }
    if (prevProps.seekRevision !== this.props.seekRevision) this.applyPendingSeek();
  }

  playerKey() {
    return JSON.stringify([routeSourceKey(this.props.currentRoute), this.state.retryGeneration]);
  }

  isCurrentPlayer(key) {
    return !this.unmounted && key === this.playerKey();
  }

  resetPlayer() {
    this.recoverOnReconnect = false;
    this.ready = false;
    this.pendingSeek = null;
    this.appliedSeekRevision = null;
    this.reseekedRevision = null;
    this.bufferingAtSeconds = null;
    if (this.audioHls && this.audioHandler) this.audioHls.off('hlsBufferCodecs', this.audioHandler);
    this.audioHls = null;
    this.audioHandler = null;
    if (this.nativeAudioTracks && this.nativeAudioHandler) {
      this.nativeAudioTracks.removeEventListener?.('addtrack', this.nativeAudioHandler);
      this.nativeAudioTracks.removeEventListener?.('removetrack', this.nativeAudioHandler);
    }
    this.nativeAudioTracks = null;
    this.nativeAudioHandler = null;
  }

  onReconnect() {
    if (!this.unmounted && this.recoverOnReconnect && this.state.videoError && this.props.currentRoute) {
      this.retryVideo();
    }
  }

  retryVideo() {
    this.props.onAudioStatusChange?.(false);
    this.resetPlayer();
    this.setState((state) => ({ videoError: null, retryGeneration: state.retryGeneration + 1, restartingLoop: false }));
    this.props.dispatch(bufferVideo(true));
  }

  onVideoBuffering(key) {
    if (!this.isCurrentPlayer(key) || this.state.videoError) return;

    const seconds = this.videoPlayer.current?.getCurrentTime();
    this.bufferingAtSeconds = Number.isFinite(seconds) ? seconds : null;
    this.props.dispatch(bufferVideo(true));
  }

  onVideoBufferEnd(key) {
    if (!this.isCurrentPlayer(key) || this.state.videoError) return;

    this.bufferingAtSeconds = null;
    this.onVideoProgress(key);
  }

  completeSeek() {
    this.pendingSeek = null;
    if (this.state.restartingLoop) this.setState({ restartingLoop: false });
  }

  applyPendingSeek() {
    const player = this.videoPlayer.current;
    if (!this.ready || !player || this.appliedSeekRevision === this.props.seekRevision) return;

    const revision = this.props.seekRevision;
    const target = this.currentVideoTime(this.props.offset ?? 0);
    this.appliedSeekRevision = revision;
    this.pendingSeek = { revision, target };
    this.reseekedRevision = null;
    if (Math.abs(player.getCurrentTime() - target) <= 0.03) {
      this.completeSeek();
    } else {
      player.seekTo(target, 'seconds');
    }
  }

  onPlayerReady(player, key) {
    if (!this.isCurrentPlayer(key)) return;
    this.ready = true;
    this.applyPendingSeek();
    const { onAudioStatusChange } = this.props;
    if (isIos()) {
      const tracks = player.getInternalPlayer()?.audioTracks;
      if (tracks && onAudioStatusChange) {
        if (this.nativeAudioTracks !== tracks) {
          this.nativeAudioTracks = tracks;
          this.nativeAudioHandler = () => {
            if (this.isCurrentPlayer(key)) onAudioStatusChange(tracks.length > 0);
          };
          tracks.addEventListener?.('addtrack', this.nativeAudioHandler);
          tracks.addEventListener?.('removetrack', this.nativeAudioHandler);
        }
        this.nativeAudioHandler();
      }
    } else {
      const hls = player.getInternalPlayer('hls');
      if (hls && onAudioStatusChange) {
        // ReactPlayer owns the HLS lifetime. Avoid accumulating callbacks on repeated ready events.
        if (this.audioHls && this.audioHls !== hls && this.audioHandler) this.audioHls.off('hlsBufferCodecs', this.audioHandler);
        if (this.audioHls !== hls) {
          this.audioHls = hls;
          this.audioHandler = (_event, data) => {
            if (this.isCurrentPlayer(key)) onAudioStatusChange(Boolean(data?.audio));
          };
          hls.on('hlsBufferCodecs', this.audioHandler);
        }
        // The codecs event can fire before onReady; the manifest still exposes audio.
        if (hls.audioTracks?.length || hls.levels?.some((level) => Boolean(level.audioCodec))) {
          onAudioStatusChange(true);
        }
      }
    }
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.onReconnect);
    this.unmounted = true;
    this.resetPlayer();
  }

  acknowledgeSeek(seconds) {
    if (!this.pendingSeek) return true;
    if (!Number.isFinite(seconds)) return false;
    if (this.pendingSeek.revision !== this.props.seekRevision) return false;
    if (Math.abs(seconds - this.pendingSeek.target) > SEEK_TOLERANCE_SECONDS) return false;
    this.completeSeek();
    return true;
  }

  onPlayerSeek(seconds, key) {
    if (!this.isCurrentPlayer(key) || !this.ready) return;
    const player = this.videoPlayer.current;
    const observedSeconds = Number.isFinite(seconds) ? seconds : player?.getCurrentTime();
    if (this.pendingSeek) {
      const target = this.pendingSeek.target;
      const matches = (time) => Number.isFinite(time) && Math.abs(time - target) <= SEEK_TOLERANCE_SECONDS;
      // The event may belong to an older command, or currentTime may still be the old frame.
      if (!matches(observedSeconds) || !matches(player?.getCurrentTime())) {
        if (this.reseekedRevision !== this.pendingSeek.revision) {
          this.reseekedRevision = this.pendingSeek.revision;
          player?.seekTo(target, 'seconds');
        }
        return;
      }
      this.completeSeek();
    }
    this.onVideoProgress(key);
  }

  onPlayerEnded(key) {
    if (!this.isCurrentPlayer(key) || !this.ready || this.state.videoError || this.state.restartingLoop) return;
    const { currentRoute, loop, desiredPlaySpeed, dispatch } = this.props;
    if (!currentRoute || desiredPlaySpeed <= 0) return;

    // A seek alone cannot restart ReactPlayer after its native ended event:
    // ReactPlayer needs a false-to-true `playing` prop transition to call play().
    if (loop?.duration > 0 && Number.isFinite(loop.startTime)) {
      this.setState({ restartingLoop: true });
      dispatch(seek(loop.startTime));
    } else {
      dispatch(pause());
    }
  }

  onVideoProgress(key) {
    if (!this.isCurrentPlayer(key) || this.state.videoError) return;
    const player = this.videoPlayer.current;
    if (!player || !this.ready || !this.props.currentRoute) return;
    const mediaSeconds = player.getCurrentTime();
    if (!Number.isFinite(mediaSeconds) || !this.acknowledgeSeek(mediaSeconds)) return;

    if (this.bufferingAtSeconds !== null) {
      if (Math.abs(mediaSeconds - this.bufferingAtSeconds) < 0.01) return;
      this.bufferingAtSeconds = null;
    }

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
    if (!e || e.fatal === false) return;
    this.recoverOnReconnect = e.type === 'networkError' && isTransientNetworkStatus(e.response?.code);
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

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
  onVideoError(e, data, key) {
    if (!this.isCurrentPlayer(key)) return;
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
      this.recoverOnReconnect = isTransientNetworkStatus(e.response?.code);
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }

    this.recoverOnReconnect = false;
    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
    this.setState({ videoError });
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
    const { videoError, restartingLoop } = this.state;
    const src = sourceForRoute(currentRoute);
    const key = this.playerKey();

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} onRetry={this.retryVideo} />
        <ReactPlayer
          ref={this.videoPlayer}
          key={key}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed && !videoError && !restartingLoop)}
          onReady={(player) => this.onPlayerReady(player, key)}
          onProgress={() => this.onVideoProgress(key)}
          progressInterval={33}
          onSeek={(seconds) => this.onPlayerSeek(seconds, key)}
          onEnded={() => this.onPlayerEnded(key)}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed > 0 ? desiredPlaySpeed : this.lastPlaybackRate}
          onBuffer={() => this.onVideoBuffering(key)}
          onBufferEnd={() => this.onVideoBufferEnd(key)}
          onError={(error, data) => this.onVideoError(error, data, key)}
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
