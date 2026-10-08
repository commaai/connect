import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { seek, pause, play, bufferVideo, videoProgress } from '../../timeline/playback';

const VideoOverlay = ({ loading, error, blocked, onRetry }) => {
  if (!error && !loading) return null;
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA] flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <>
            <ErrorOutline className="mb-2" />
            <Typography>{error}</Typography>
            {onRetry && <Button onClick={onRetry} color="inherit">{blocked ? 'Play video' : 'Retry'}</Button>}
          </>
        ) : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
      </div>
    </div>
  );
};

export class DriveVideoPlayer extends Component {
  videoPlayer = React.createRef();
  mounted = false;
  ready = false;
  pendingSeek = null;
  resumeAfterSeek = false;
  playRequest = 0;
  lastPlaySpeed = this.props.desiredPlaySpeed || 1;
  state = { videoError: null, blocked: false, attempt: 0 };

  componentDidMount() {
    this.mounted = true;
    this.props.onAudioStatusChange?.(false);
    if (!this.stopEmptyRange()) this.props.dispatch(bufferVideo(true));
  }

  componentDidUpdate(prevProps) {
    if (prevProps.desiredPlaySpeed !== this.props.desiredPlaySpeed) {
      this.playRequest += 1;
      if (!this.props.desiredPlaySpeed) {
        this.resumeAfterSeek = false;
        if (this.media && !this.media.paused) this.media.pause();
      } else {
        this.lastPlaySpeed = this.props.desiredPlaySpeed;
        this.resumeSpeed = null;
        if (this.state.blocked) this.setState({ blocked: false, videoError: null });
      }
    }
    if (this.stopEmptyRange()) return;
    if (prevProps.seekVersion !== this.props.seekVersion
      || prevProps.currentRoute.videoStartOffset !== this.props.currentRoute.videoStartOffset) {
      this.requestSeek();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.removeListeners();
  }

  isCurrent(attempt) {
    return this.mounted && attempt === this.state.attempt;
  }

  removeListeners() {
    this.media?.removeEventListener('loadedmetadata', this.applySeek);
    this.media?.removeEventListener('canplay', this.onCanPlay);
    this.media?.removeEventListener('seeking', this.onBuffer);
    this.audioTracks?.removeEventListener('addtrack', this.detectAudio);
    this.audioTracks?.removeEventListener('removetrack', this.detectAudio);
    this.hls?.off('hlsBufferCodecs', this.onCodecs);
    this.media = null;
    this.audioTracks = null;
    this.hls = null;
  }

  onReady = () => {
    if (this.ready) return;
    this.ready = true;
    this.media = this.videoPlayer.current.getInternalPlayer();
    this.hls = this.videoPlayer.current.getInternalPlayer('hls');
    this.audioTracks = this.media?.audioTracks;
    this.media?.addEventListener('loadedmetadata', this.applySeek);
    this.media?.addEventListener('canplay', this.onCanPlay);
    this.media?.addEventListener('seeking', this.onBuffer);
    this.audioTracks?.addEventListener('addtrack', this.detectAudio);
    this.audioTracks?.addEventListener('removetrack', this.detectAudio);
    this.hls?.on('hlsBufferCodecs', this.onCodecs);
    this.detectAudio();
    this.requestSeek();
  };

  detectAudio = () => {
    if (this.mounted) {
      this.props.onAudioStatusChange?.(Boolean(this.audioTracks?.length || this.hls?.audioTracks?.length));
    }
  };

  onCodecs = (_event, data) => {
    if (this.mounted) this.props.onAudioStatusChange?.(Boolean(data.audio));
  };

  requestSeek() {
    const { offset, loop, currentRoute } = this.props;
    let seconds = Math.max(0, ((offset ?? loop?.startTime ?? 0) - (currentRoute.videoStartOffset || 0)) / 1000);
    const duration = this.videoPlayer.current?.getDuration();
    if (Number.isFinite(duration)) seconds = Math.min(seconds, duration);
    this.pendingSeek = { seconds };
    this.applySeek();
  }

  applySeek = () => {
    if (this.stopEmptyRange()) return;
    if (!this.mounted || !this.ready || !this.pendingSeek || !this.media || this.media.readyState < 1) return;
    const { seconds } = this.pendingSeek;
    if (Math.abs(this.media.currentTime - seconds) < 0.001) {
      this.onSeek();
    } else {
      this.props.dispatch(bufferVideo(true));
      try {
        this.videoPlayer.current.seekTo(seconds, 'seconds');
      } catch (error) {
        this.onError(error);
      }
    }
  };

  onSeek = () => {
    if (this.media?.seeking) return;
    this.pendingSeek = null;
    this.reportProgress();
    this.onCanPlay();
    if (this.resumeAfterSeek) {
      this.resumeAfterSeek = false;
      if (this.props.desiredPlaySpeed) this.resume();
    }
  };

  onBuffer = () => {
    if (this.mounted && !this.stopEmptyRange()) this.props.dispatch(bufferVideo(true));
  };

  onCanPlay = () => {
    if (this.mounted && !this.pendingSeek && this.media?.readyState >= 2) {
      this.props.dispatch(bufferVideo(false));
    }
  };

  loopStart() {
    const { loop, currentRoute } = this.props;
    if (!loop || loop.duration <= 0) return null;
    const start = Math.max(loop.startTime, currentRoute.videoStartOffset || 0);
    const duration = this.videoPlayer.current?.getDuration();
    const end = Number.isFinite(duration)
      ? Math.min(loop.startTime + loop.duration, duration * 1000 + (currentRoute.videoStartOffset || 0))
      : loop.startTime + loop.duration;
    return start < end ? start : null;
  }

  stopEmptyRange() {
    if (!this.mounted || !this.props.loop || this.loopStart() !== null) return false;
    this.pendingSeek = null;
    this.resumeAfterSeek = false;
    if (this.media && !this.media.paused) this.media.pause();
    if (this.props.desiredPlaySpeed) this.props.dispatch(pause());
    if (this.props.isBufferingVideo) this.props.dispatch(bufferVideo(false));
    return true;
  }

  onPlay = () => {
    if (!this.media || this.media.paused || this.stopEmptyRange()) return;
    if (!this.props.desiredPlaySpeed) {
      this.props.dispatch(play(this.resumeSpeed || this.lastPlaySpeed));
    }
  };

  reportProgress = () => {
    if (this.stopEmptyRange()) return;
    if (!this.mounted || !this.ready || this.pendingSeek || this.media?.seeking) return;
    const { dispatch, currentRoute, seekVersion = 0, desiredPlaySpeed, loop } = this.props;
    const time = this.videoPlayer.current?.getCurrentTime();
    if (!Number.isFinite(time)) return;
    const offset = time * 1000 + (currentRoute.videoStartOffset || 0);
    const loopStart = this.loopStart();
    if (!this.state.videoError && desiredPlaySpeed && loopStart !== null && offset >= loop.startTime + loop.duration) {
      dispatch(seek(loopStart));
      return;
    }
    dispatch(videoProgress(offset, currentRoute.fullname, seekVersion));
  };

  onPause = () => {
    if (!this.media?.paused || this.media.ended) return;
    this.reportProgress();
    if (!this.state.videoError && this.props.desiredPlaySpeed) this.props.dispatch(pause());
  };

  onEnded = () => {
    if (this.stopEmptyRange()) return;
    const start = this.loopStart();
    if (this.props.desiredPlaySpeed && start !== null) {
      this.resumeAfterSeek = true;
      this.props.dispatch(seek(start));
    } else {
      this.reportProgress();
      this.props.dispatch(pause());
    }
  };

  onError = (error, data) => {
    // hls.js recovers nonfatal errors itself; source teardown can cancel play().
    if ((error === 'hlsError' && data?.fatal === false) || error?.name === 'AbortError') return;
    const blocked = error?.name === 'NotAllowedError';
    const missing = (data || error)?.response?.code === 404;
    this.setState({
      blocked,
      videoError: blocked ? 'Tap to play video.' : missing
        ? 'This video segment has not uploaded yet or has been deleted.' : 'Unable to load video.',
    });
    if (blocked) {
      this.resumeSpeed = this.props.desiredPlaySpeed || 1;
      this.props.dispatch(pause());
    }
    this.props.dispatch(bufferVideo(false));
  };

  resume = () => {
    const { attempt } = this.state;
    this.playRequest += 1;
    const request = this.playRequest;
    const speed = this.resumeSpeed || this.props.desiredPlaySpeed || 1;
    try {
      Promise.resolve(this.media?.play()).then(() => {
        if (!this.isCurrent(attempt) || request !== this.playRequest) return;
        this.setState({ blocked: false, videoError: null });
        this.resumeSpeed = null;
        this.props.dispatch(play(speed));
      }).catch((error) => {
        if (this.isCurrent(attempt) && request === this.playRequest) this.onError(error);
      });
    } catch (error) {
      this.onError(error);
    }
  };

  onRetry = () => {
    if (this.state.blocked && this.media) {
      // Call play inside the click gesture for browsers that reject autoplay.
      this.resume();
      return;
    }
    this.removeListeners();
    this.ready = false;
    this.pendingSeek = null;
    this.props.onAudioStatusChange?.(false);
    this.setState(({ attempt }) => ({ videoError: null, blocked: false, attempt: attempt + 1 }));
    this.props.dispatch(bufferVideo(true));
  };

  render() {
    const { src, desiredPlaySpeed, isBufferingVideo, isMuted } = this.props;
    const { videoError, blocked, attempt } = this.state;
    const emptyRange = this.props.loop && this.loopStart() === null;
    const callback = (handler) => (...args) => {
      if (this.isCurrent(attempt)) handler(...args);
    };
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={isBufferingVideo}
          error={emptyRange ? 'No video is available in this selected range.' : videoError}
          blocked={blocked}
          onRetry={emptyRange ? null : this.onRetry}
        />
        <ReactPlayer
          key={attempt}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(desiredPlaySpeed && !videoError && !emptyRange)}
          playbackRate={desiredPlaySpeed || 1}
          progressInterval={100}
          config={{ file: { hlsVersion: '1.4.8', hlsOptions: { maxBufferLength: 40 } } }}
          onReady={callback(this.onReady)}
          onPlay={callback(this.onPlay)}
          onProgress={callback(this.reportProgress)}
          onSeek={callback(this.onSeek)}
          onBuffer={callback(this.onBuffer)}
          onBufferEnd={callback(this.onCanPlay)}
          onPause={callback(this.onPause)}
          onEnded={callback(this.onEnded)}
          onError={callback(this.onError)}
        />
      </div>
    );
  }
}

export function DriveVideo(props) {
  const { currentRoute } = props;
  if (!currentRoute) return null;
  const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
  return <DriveVideoPlayer key={src} {...props} src={src} />;
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekVersion: state.seekVersion,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
