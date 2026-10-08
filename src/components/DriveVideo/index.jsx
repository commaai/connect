/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, PlayArrow } from '../../icons';
import {
  resetPlayback, play, pause, videoProgress, setHasAudio, setPlaybackSpeed, setVideoStatus, VideoStatus,
} from '../../timeline/playback';

// react-player's getSDK() resolves an existing window.Hls without fetching —
// pre-arm it from the bundled copy so HLS never depends on a CDN fetch.
if (typeof window !== 'undefined' && !window.Hls) {
  import('hls.js').then((m) => { window.Hls ??= m.default; });
}

const SEEK_EPSILON_S = 0.05; // seeks inside this window are already satisfied
const STALL_TIMEOUT_MS = 15000; // buffering this long without growth -> error
const LOADING_OVERLAY_MS = 300; // shorter stalls never paint the spinner

const VideoOverlay = ({
  loading, error, expired, autoplayBlocked, onRetry, onPlay,
}) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography role="alert">{error}</Typography>
        {expired && (
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        )}
        {!expired && onRetry && (
          <Button variant="outlined" onClick={onRetry} aria-label="Retry video">
            Try again
          </Button>
        )}
      </>
    );
  } else if (autoplayBlocked) {
    content = (
      <Button variant="outlined" onClick={onPlay} aria-label="Play video">
        <PlayArrow className="mr-1" />
        Tap to play video
      </Button>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-[70] absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};


class RouteVideo extends Component {
  player = React.createRef();
  mounted = false;
  ready = false;
  video = null;
  hls = null;
  recoveryUsed = false;
  seekTarget = null; // route-ms target of the in-flight seek
  stallTimer = null;
  stallBufferedEnd = -1;
  loadingTimer = null;
  state = {
    videoError: null, errorExpired: false, autoplayBlocked: false,
    loadingVisible: false, retryAttempt: 0,
  };

  componentDidMount() {
    this.mounted = true;
    this.props.dispatch(resetPlayback());
  }

  componentDidUpdate(prevProps) {
    const {
      seekRequest, loop, offset, currentRoute, videoStatus, isPlaying, dispatch,
    } = this.props;
    const vso = currentRoute.videoStartOffset || 0;
    const prevVso = prevProps.currentRoute.videoStartOffset || 0;

    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      // a scrub on a dead player remounts it; the retry restores the position
      if (videoStatus === VideoStatus.FAILED) this.retry();
      else this.seekTo(seekRequest.offset);
    } else if (loop !== prevProps.loop || vso !== prevVso) {
      const loopEnd = loop ? loop.startTime + loop.duration : null;
      const emptyRange = loop && vso > 0 && loopEnd <= vso;
      if (emptyRange) {
        // the range has no video at all — pause instead of playing dead air
        if (isPlaying) dispatch(pause());
      } else if (vso !== prevVso) {
        // videoStartOffset arrived late; the same media position now means a
        // different route offset — rebase instead of rewinding
        const video = this.player.current?.getInternalPlayer();
        const corrected = video ? Math.round(video.currentTime * 1000) + vso : offset;
        if (loopEnd != null && (corrected < loop.startTime || corrected > loopEnd)) {
          this.seekTo(loop.startTime);
        } else {
          dispatch(videoProgress(currentRoute.fullname, corrected));
        }
      } else if (loopEnd == null || offset < loop.startTime || offset > loopEnd) {
        // only reseek when the new loop doesn't already contain the position
        this.seekTo(offset);
      }
    }

    if (videoStatus !== prevProps.videoStatus) {
      if (videoStatus === VideoStatus.LOADING) this.startLoadingWatch();
      else this.stopLoadingWatch();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.stopLoadingWatch();
    this.video?.audioTracks?.removeEventListener?.('addtrack', this.onAudioTrack);
  }

  seekTo = (offset) => {
    if (!this.ready || !Number.isFinite(offset)) return;
    const video = this.player.current?.getInternalPlayer();
    if (!video) return;
    const { currentRoute, loop } = this.props;
    const start = loop?.startTime ?? 0;
    const end = loop ? start + loop.duration : currentRoute.duration;
    const clamped = Math.max(start, Math.min(offset, end));
    const seconds = Math.max(0, (clamped - (currentRoute.videoStartOffset || 0)) / 1000);
    // skip no-op seeks: they still flash loading state and churn hls.js
    if (Math.abs(video.currentTime - seconds) < SEEK_EPSILON_S) return;
    this.seekTarget = clamped;
    this.player.current.seekTo(seconds, 'seconds');
  };

  retry = () => {
    this.ready = false;
    this.recoveryUsed = false;
    this.seekTarget = null;
    this.setState((s) => ({
      videoError: null, errorExpired: false, autoplayBlocked: false,
      loadingVisible: false, retryAttempt: s.retryAttempt + 1,
    }));
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
  };

  onOverlayPlay = () => {
    // called from a click handler, so the play() gesture is legal on iOS
    this.setState({ autoplayBlocked: false });
    this.video?.play().catch(this.onError);
    this.props.dispatch(play());
  };

  startLoadingWatch = () => {
    this.loadingTimer = setTimeout(() => {
      if (this.mounted) this.setState({ loadingVisible: true });
    }, LOADING_OVERLAY_MS);
    this.stallBufferedEnd = -1;
    this.stallTimer = setTimeout(this.checkStall, STALL_TIMEOUT_MS);
  };

  stopLoadingWatch = () => {
    clearTimeout(this.loadingTimer);
    this.loadingTimer = null;
    clearTimeout(this.stallTimer);
    this.stallTimer = null;
    if (this.state.loadingVisible) this.setState({ loadingVisible: false });
  };

  checkStall = () => {
    this.stallTimer = null;
    if (!this.mounted || this.props.videoStatus !== VideoStatus.LOADING) return;
    const video = this.player.current?.getInternalPlayer();
    if (!video) return;
    if (document.hidden || video.paused) {
      // timers don't run in background tabs, and a paused video isn't stalling
      this.stallTimer = setTimeout(this.checkStall, STALL_TIMEOUT_MS);
      return;
    }
    const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : -1;
    if (bufferedEnd > this.stallBufferedEnd + 0.25) {
      this.stallBufferedEnd = bufferedEnd;
      this.stallTimer = setTimeout(this.checkStall, STALL_TIMEOUT_MS);
      return;
    }
    this.onError({ name: 'StallTimeout' });
  };

  onReady = (player) => {
    const video = player.getInternalPlayer();
    const hls = player.getInternalPlayer('hls');
    if (hls !== this.hls) {
      this.hls = hls;
      if (hls) {
        hls.on('hlsBufferCodecs', (_event, data) => this.props.dispatch(setHasAudio(!!data.audio)));
      }
    }
    if (video !== this.video) {
      this.video?.audioTracks?.removeEventListener?.('addtrack', this.onAudioTrack);
      this.video = video;
      this.checkAudio(video);
      // iOS populates audioTracks asynchronously for some streams
      video?.audioTracks?.addEventListener?.('addtrack', this.onAudioTrack);
    }
    // onReady refires whenever the media source reloads (fresh share_sig,
    // retry remount, ...) — always land back on the current offset instead
    // of restarting at zero
    this.ready = true;
    this.seekTo(this.props.offset);
    if (this.frameId == null) {
      this.frameId = requestAnimationFrame(this.onAnimationFrame);
    }
  };

  onAudioTrack = () => {
    if (this.video) this.checkAudio(this.video);
  };

  checkAudio = (video) => {
    const has = Boolean(video?.audioTracks?.length)
      || video?.mozHasAudio // Firefox
      || video?.webkitAudioDecodedByteCount > 0; // Safari
    this.props.dispatch(setHasAudio(Boolean(has)));
  };

  onAnimationFrame = () => {
    const video = this.player.current?.getInternalPlayer();
    if (video) this.updateOffset(video);
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  updateOffset = (video) => {
    const {
      currentRoute, dispatch, loop, isPlaying, offset, videoStatus,
    } = this.props;
    if (!this.ready || video.seeking || videoStatus === VideoStatus.FAILED) return;

    // don't publish positions until an issued seek actually lands
    if (this.seekTarget != null) {
      const target = (this.seekTarget - (currentRoute.videoStartOffset || 0)) / 1000;
      if (Math.abs(video.currentTime - target) > 0.25) return;
      this.seekTarget = null;
    }

    const vso = currentRoute.videoStartOffset || 0;
    const nextOffset = Math.round(video.currentTime * 1000) + vso;

    // media advancing while marked loading means the stall healed itself
    if (videoStatus === VideoStatus.LOADING && !video.paused && video.readyState >= 3) {
      dispatch(setVideoStatus(VideoStatus.READY));
    }

    if (isPlaying && loop?.duration > 0) {
      const loopEnd = loop.startTime + loop.duration;
      const outOfLoop = nextOffset >= loopEnd || nextOffset < loop.startTime - 100;
      if (outOfLoop && loopEnd > vso) {
        this.seekTo(loop.startTime);
        return;
      }
    }
    if (nextOffset !== offset) dispatch(videoProgress(currentRoute.fullname, nextOffset));
  };

  onPlayable = () => {
    this.seekTarget = null;
    this.setState({ videoError: null });
    this.props.dispatch(setVideoStatus(VideoStatus.READY));
  };

  onSeeking = (event) => {
    this.setState({ videoError: null });
    // pulls the target segment forward; a buffered seek resolves quietly
    this.player.current.getInternalPlayer('hls')?.startLoad(event.target.currentTime);
  };

  onEnded = () => {
    const video = this.player.current?.getInternalPlayer();
    const { isPlaying, loop, dispatch, currentRoute } = this.props;
    const mediaEndMs = (video?.duration ?? 0) * 1000 + (currentRoute.videoStartOffset || 0);
    // a loop that starts past the media's end can never play — stop there
    // instead of seek-looping on dead air
    if (isPlaying && loop?.duration > 0 && loop.startTime < mediaEndMs) {
      this.seekTo(loop.startTime);
      video?.play().catch(this.onError);
    } else {
      dispatch(pause());
    }
  };

  onError = (error, data) => {
    if (!this.mounted) return;
    if (error === 'hlsError') {
      const video = this.player.current?.getInternalPlayer();
      if (data?.frag && data.response?.code === 404 && video) {
        // missing segment: jump just past it and keep playing
        video.currentTime = data.frag.start + data.frag.duration + 0.05;
        return;
      }
      if (!data?.fatal) return; // hls.js retries transient errors itself
      if (this.hls && !this.recoveryUsed) {
        // media errors are often recoverable; give hls.js one shot first
        this.recoveryUsed = true;
        if (data.type === 'mediaError') this.hls.recoverMediaError();
        else this.hls.startLoad();
        return;
      }
      error = data;
    }
    if (!error || error.name === 'AbortError') return;
    const { dispatch } = this.props;
    if (error.name === 'NotAllowedError') {
      this.setState({ autoplayBlocked: true });
      dispatch(setVideoStatus(VideoStatus.READY));
      dispatch(pause());
      return;
    }
    const httpCode = error.response?.code;
    const mediaErr = error.target?.error ?? error.currentTarget?.error;
    const expired = httpCode === 401 || httpCode === 403;
    dispatch(setVideoStatus(VideoStatus.FAILED));
    this.setState({
      errorExpired: expired,
      videoError: expired
        ? 'This video link expired. Reload the page to get a fresh one.'
        : httpCode === 404
          ? 'This video segment has not uploaded yet or has been deleted.'
          : error.name === 'StallTimeout' || mediaErr?.code === 2
            ? 'Video stopped loading. Check your connection and try again.'
            : 'Unable to load video',
    });
  };

  render() {
    const {
      currentRoute, isPlaying, desiredPlaySpeed, videoStatus, isMuted, loop, offset,
    } = this.props;
    const {
      videoError, errorExpired, autoplayBlocked, loadingVisible, retryAttempt,
    } = this.state;
    const vso = currentRoute.videoStartOffset || 0;
    const emptyRange = loop && vso > 0 && loop.startTime + loop.duration <= vso;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={loadingVisible && !videoError && !emptyRange}
          error={emptyRange ? 'No video is available in the selected range.' : videoError}
          expired={errorExpired}
          onRetry={emptyRange ? null : this.retry}
          autoplayBlocked={autoplayBlocked && !emptyRange}
          onPlay={this.onOverlayPlay}
        />
        <ReactPlayer
          key={retryAttempt}
          ref={this.player}
          url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={isPlaying && !emptyRange}
          playbackRate={desiredPlaySpeed}
          onReady={this.onReady}
          onBuffer={() => {
            if (videoStatus !== VideoStatus.FAILED) this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
          }}
          onBufferEnd={this.onPlayable}
          onPlay={() => {
            this.setState({ autoplayBlocked: false });
            if (!isPlaying) this.props.dispatch(play());
          }}
          onPause={() => {
            const video = this.player.current?.getInternalPlayer();
            // ignore pause events that aren't real (hls.js resets, stale nodes)
            if (isPlaying && video?.paused && !video.ended) this.props.dispatch(pause());
          }}
          onPlaybackRateChange={(rate) => {
            // adopt external rate changes (iOS native controls) once loaded;
            // the remount echo during loading is not a user choice
            if (rate !== desiredPlaySpeed && videoStatus === VideoStatus.READY) {
              this.props.dispatch(setPlaybackSpeed(rate));
            }
          }}
          onEnded={this.onEnded}
          onError={this.onError}
          config={{
            // only used if the bundled hls.js hasn't finished loading
            hlsVersion: '1.7.3',
            hlsOptions: {
              maxBufferLength: 40,
              // first fetch lands on the right segment on cold ranged links
              startPosition: Math.max(0, (offset - vso) / 1000),
              ...api.video.getHlsOptions?.(currentRoute),
            },
            attributes: {
              onTimeUpdate: (event) => this.updateOffset(event.target),
              onSeeking: this.onSeeking,
              onSeeked: this.onPlayable,
              onCanPlay: this.onPlayable,
            },
          }}
        />
      </div>
    );
  }
}

const DriveVideo = (props) => props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} />
  : null;

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRequest: state.seekRequest,
  currentRoute: state.currentRoute,
  loop: state.loop,
  isPlaying: state.isPlaying,
  videoStatus: state.videoStatus,
});

export default connect(stateToProps)(DriveVideo);
