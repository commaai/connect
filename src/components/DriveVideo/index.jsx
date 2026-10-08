/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { reportVideoTime, bufferVideo, pause, play, seek } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error, onRetry }) => {
  if (!loading && !error) return null;
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {error ? (
          <>
            <ErrorOutline className="mb-2" />
            <Typography>{error}</Typography>
            <button type="button" className="mt-3 text-white underline" onClick={onRetry}>
              Retry video
            </button>
          </>
        ) : (
          <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
        )}
      </div>
    </div>
  );
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.videoPlayer = React.createRef();
    this.mounted = false;
    this.seekPending = false;
    this.pendingSeekTarget = null;
    this.seekIssued = false;
    this.resumeAfterSeek = false;
    this.audioListener = null;
    this.lastPlaybackRate = props.desiredPlaySpeed || 1;
    this.state = { src: '', playerReady: false, videoError: null, retryCount: 0 };
  }

  componentDidMount() {
    this.mounted = true;
    this.updateVideoSource();
  }

  componentDidUpdate(prevProps) {
    const prevRoute = prevProps.currentRoute;
    const currentRoute = this.props.currentRoute;
    const routeChanged = prevRoute?.fullname !== currentRoute?.fullname
      || prevRoute?.share_exp !== currentRoute?.share_exp
      || prevRoute?.share_sig !== currentRoute?.share_sig;
    if (routeChanged) {
      this.updateVideoSource();
      return;
    }

    if (prevProps.seekRevision !== this.props.seekRevision) this.requestVideoSeek();

    if (prevRoute?.videoStartOffset !== currentRoute?.videoStartOffset
      && currentRoute?.videoStartOffset != null) {
      if (this.seekPending) {
        this.pendingSeekTarget = this.currentVideoTime();
        this.seekIssued = false;
      } else {
        const player = this.videoPlayer.current;
        if (player) {
          this.props.dispatch(reportVideoTime(
            (player.getCurrentTime() * 1000) + currentRoute.videoStartOffset,
          ));
        }
      }
    }

    if (this.props.desiredPlaySpeed > 0) this.lastPlaybackRate = this.props.desiredPlaySpeed;
    this.applyPendingSeek(this.currentPlayerToken());
  }

  componentWillUnmount() {
    this.mounted = false;
    this.removeAudioListener();
  }

  currentPlayerToken() {
    return JSON.stringify([
      this.props.currentRoute?.fullname,
      this.props.currentRoute?.share_exp,
      this.props.currentRoute?.share_sig,
      this.state.src,
      this.state.retryCount,
    ]);
  }

  isCurrentPlayer(token) {
    return this.mounted && token === this.currentPlayerToken();
  }

  requestVideoSeek() {
    this.seekPending = true;
    this.pendingSeekTarget = this.currentVideoTime();
    this.seekIssued = false;
  }

  updateVideoSource() {
    this.removeAudioListener();
    const { currentRoute, dispatch, onAudioStatusChange } = this.props;
    const src = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : '';
    this.resumeAfterSeek = false;
    this.requestVideoSeek();
    this.setState({ src, playerReady: false, videoError: null, retryCount: 0 });
    if (onAudioStatusChange) onAudioStatusChange(false);
    dispatch(bufferVideo(Boolean(currentRoute)));
  }

  currentVideoTime() {
    const { currentRoute, offset, loop } = this.props;
    if (!currentRoute) return 0;
    const timelineOffset = offset == null ? (loop?.startTime ?? 0) : offset;
    const videoStartOffset = currentRoute.videoStartOffset ?? 0;
    return Math.max(0, (timelineOffset - videoStartOffset) / 1000);
  }

  applyPendingSeek(token) {
    if (!this.seekPending || this.seekIssued || !this.state.playerReady
      || !this.isCurrentPlayer(token)) return;
    const player = this.videoPlayer.current;
    if (!player) return;
    const duration = player.getDuration();
    if (!(duration > 0)) return;
    this.pendingSeekTarget = Math.max(0, Math.min(this.pendingSeekTarget, duration));
    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - this.pendingSeekTarget) < 0.05) {
      this.finishVideoSeek(currentTime, token);
      return;
    }
    this.seekIssued = true;
    player.seekTo(this.pendingSeekTarget, 'seconds');
  }

  finishVideoSeek(seconds, token) {
    if (!this.isCurrentPlayer(token)) return;
    this.seekPending = false;
    this.pendingSeekTarget = null;
    this.seekIssued = false;
    this.reportVideoTime(seconds);
    if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
    if (this.resumeAfterSeek) {
      this.resumeAfterSeek = false;
      if (this.props.desiredPlaySpeed === 0) return;
      const media = this.videoPlayer.current?.getInternalPlayer();
      try {
        const result = media?.play?.();
        if (result?.catch) result.catch(error => this.onVideoError(error, null, token));
      } catch (error) {
        this.onVideoError(error, null, token);
      }
    }
  }

  reportVideoTime(seconds) {
    const videoStartOffset = this.props.currentRoute?.videoStartOffset ?? 0;
    this.props.dispatch(reportVideoTime((seconds * 1000) + videoStartOffset));
  }

  removeAudioListener() {
    if (!this.audioListener) return;
    const { target, handler, hls } = this.audioListener;
    if (hls) target.off('hlsBufferCodecs', handler);
    else target.removeEventListener('addtrack', handler);
    this.audioListener = null;
  }

  onPlayerReady(player, token) {
    if (!this.isCurrentPlayer(token)) return;
    this.removeAudioListener();
    this.setState({ playerReady: true }, () => this.applyPendingSeek(token));
    const internalPlayer = player.getInternalPlayer();
    const onAudioStatusChange = (hasAudio) => {
      if (this.isCurrentPlayer(token) && this.props.onAudioStatusChange) {
        this.props.onAudioStatusChange(hasAudio);
      }
    };

    const hls = !isIos() && player.getInternalPlayer('hls');
    if (hls) {
      const handler = (_event, data) => onAudioStatusChange(Boolean(data?.audio));
      hls.on('hlsBufferCodecs', handler);
      this.audioListener = { target: hls, handler, hls: true };
      return;
    }

    const tracks = internalPlayer?.audioTracks;
    if (tracks) {
      const updateAudio = () => onAudioStatusChange(tracks.length > 0);
      updateAudio();
      tracks.addEventListener?.('addtrack', updateAudio);
      this.audioListener = { target: tracks, handler: updateAudio, hls: false };
    }
    if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
  }

  onVideoProgress(progress, token) {
    if (!this.isCurrentPlayer(token) || !Number.isFinite(progress?.playedSeconds)) return;
    if (this.seekPending) {
      this.applyPendingSeek(token);
      return;
    }
    this.reportVideoTime(progress.playedSeconds);
  }

  onVideoSeek(seconds, token) {
    if (!this.isCurrentPlayer(token) || !Number.isFinite(seconds)) return;
    if (this.seekPending) {
      if (!this.seekIssued || Math.abs(seconds - this.pendingSeekTarget) > 0.5) return;
      this.finishVideoSeek(seconds, token);
      return;
    }
    this.reportVideoTime(seconds);
    if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
  }

  onVideoBuffer(token) {
    if (this.isCurrentPlayer(token) && !this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  onVideoResume(token) {
    if (!this.isCurrentPlayer(token)) return;
    if (this.state.videoError) this.setState({ videoError: null });
    if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
  }

  onVideoPlay(token) {
    if (!this.isCurrentPlayer(token)) return;
    if (this.state.videoError) this.setState({ videoError: null });
    if (this.props.desiredPlaySpeed === 0) this.props.dispatch(play(this.lastPlaybackRate));
  }

  onVideoPause(token) {
    const media = this.videoPlayer.current?.getInternalPlayer();
    if (this.isCurrentPlayer(token) && !media?.ended && this.props.desiredPlaySpeed !== 0) {
      this.props.dispatch(pause());
      if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
    }
  }

  onVideoEnded(token) {
    if (!this.isCurrentPlayer(token) || this.props.desiredPlaySpeed === 0) return;
    const { loop, currentRoute } = this.props;
    const duration = this.videoPlayer.current?.getDuration();
    if (!loop || !(loop.duration > 0) || !(duration > 0)) return;
    const mediaEndOffset = (currentRoute?.videoStartOffset ?? 0) + (duration * 1000);
    const loopEnd = loop.startTime + loop.duration;
    if (loop.startTime < mediaEndOffset && mediaEndOffset <= loopEnd + 1) {
      this.resumeAfterSeek = true;
      this.props.dispatch(seek(loop.startTime));
    }
  }

  onVideoError(error, data, token) {
    if (!this.isCurrentPlayer(token) || !error || error.name === 'AbortError') return;
    if (error === 'hlsError') {
      if (!data?.fatal) return;
      error = data;
    }
    if (error.name === 'NotAllowedError') {
      this.props.dispatch(pause());
      if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
      return;
    }

    this.props.dispatch(bufferVideo(true));
    const response = error.response || data?.response;
    const isNotFound = response?.code === 404 || response?.status === 404;
    const message = isNotFound
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (error.type === 'networkError'
        ? 'Unable to load video. Check network connection.'
        : (response?.text || error.message || 'Unable to load video'));
    this.setState({ videoError: message });
  }

  retryVideo(token) {
    if (!this.isCurrentPlayer(token)) return;
    this.removeAudioListener();
    this.resumeAfterSeek = false;
    this.requestVideoSeek();
    this.props.dispatch(bufferVideo(true));
    this.setState(prevState => ({
      videoError: null,
      playerReady: false,
      retryCount: prevState.retryCount + 1,
    }));
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError } = this.state;
    const playbackRate = desiredPlaySpeed > 0 ? desiredPlaySpeed : this.lastPlaybackRate;
    const token = this.currentPlayerToken();

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} onRetry={() => this.retryVideo(token)} />
        <ReactPlayer
          key={token}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={(player) => this.onPlayerReady(player, token)}
          onDuration={() => this.applyPendingSeek(token)}
          onProgress={(progress) => this.onVideoProgress(progress, token)}
          onSeek={(seconds) => this.onVideoSeek(seconds, token)}
          onBuffer={() => this.onVideoBuffer(token)}
          onBufferEnd={() => this.onVideoResume(token)}
          onPlay={() => this.onVideoPlay(token)}
          onPause={() => this.onVideoPause(token)}
          onEnded={() => this.onVideoEnded(token)}
          onError={(error, data) => this.onVideoError(error, data, token)}
          progressInterval={250}
          config={{ hlsVersion: '1.4.8', hlsOptions: { maxBufferLength: 40 } }}
          playbackRate={playbackRate}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRevision: state.seekRevision,
  isBufferingVideo: state.isBufferingVideo,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
