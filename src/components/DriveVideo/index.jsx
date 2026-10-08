import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';
import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { restartLoop, pause, play, bufferVideo, videoProgress } from '../../timeline/playback';
import { isFirefox } from '../../utils/browser.js';

const sourceIdentity = (route) => JSON.stringify([route?.fullname, route?.share_exp, route?.share_sig]);

// Signed stream URLs expire; only a fresh route fetch (a reload) renews them.
const EXPIRED_ERROR = 'This video link has expired. Reload the page to continue.';
const HTTP_ERRORS = {
  401: EXPIRED_ERROR,
  403: EXPIRED_ERROR,
  404: 'This video segment has not uploaded yet or has been deleted.',
};

const RetryButton = ({ error, onRetry, className = '' }) => (
  <button type="button" onClick={error === EXPIRED_ERROR ? () => window.location.reload() : onRetry} className={`${className} shrink-0 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#16181A] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`}>
    {error === EXPIRED_ERROR ? 'Reload page' : 'Retry video'}
  </button>
);

const VideoOverlay = ({ loading, error, onRetry }) => {
  if (error) {
    return (
      <div role="alert" className="z-10 absolute inset-0 flex items-center justify-center bg-[#16181A]/85 animate-fadein">
        <div className="p-6 text-center max-w-md">
          <ErrorOutline className="mb-2 text-white/60" aria-hidden="true" />
          <Typography className="pb-4 text-white/80">{error}</Typography>
          <RetryButton error={error} onRetry={onRetry} />
        </div>
      </div>
    );
  }
  if (loading) {
    // A light, delayed scrim keeps the last frame visible and does not flash
    // for seeks the buffer can satisfy immediately.
    return (
      <div role="status" aria-label="Loading video" className="z-10 absolute inset-0 flex items-center justify-center bg-black/30 animate-[fadein_0.2s_ease-out_0.3s_both]">
        <CircularProgress style={{ color: Colors.white }} thickness={3.6} size={40} />
      </div>
    );
  }
  return null;
};

// While the map is shown the player is hidden, so explain why the map is not
// moving rather than leaving a stalled marker.
const VideoErrorBanner = ({ error, onRetry }) => (
  <div role="alert" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[#16181A] py-3 pl-4 pr-3">
    <ErrorOutline className="text-white/60" fontSize="small" aria-hidden="true" />
    <Typography className="min-w-48 flex-1 text-white/80">{error}</Typography>
    <RetryButton error={error} onRetry={onRetry} className="ml-auto" />
  </div>
);

export class DriveVideo extends Component {
  videoPlayer = React.createRef();
  state = { videoError: null, retry: 0, route: null };

  static getDerivedStateFromProps(props, state) {
    const route = sourceIdentity(props.currentRoute);
    return route !== state.route ? { route, videoError: null, retry: state.retry + 1 } : null;
  }
  media = null;
  listeners = [];
  pendingSeek = false;
  frameRequest = null;
  hasAudio = false;
  seekAttempts = 0;

  componentDidUpdate(prevProps) {
    if (sourceIdentity(prevProps.currentRoute) !== sourceIdentity(this.props.currentRoute)) {
      this.detachMedia();
      this.props.onAudioStatusChange?.(false);
      this.props.dispatch(bufferVideo(true));
    } else if (prevProps.seekRevision !== this.props.seekRevision
      || prevProps.currentRoute?.videoStartOffset !== this.props.currentRoute?.videoStartOffset) {
      this.seekMedia();
    }
  }

  componentWillUnmount() {
    this.detachMedia();
  }

  detachMedia() {
    this.listeners.forEach(([target, event, listener]) => target.removeEventListener(event, listener));
    this.listeners = [];
    if (this.frameRequest !== null) this.media?.cancelVideoFrameCallback?.(this.frameRequest);
    this.frameRequest = null;
    this.media = null;
    this.pendingSeek = false;
    this.hasAudio = false;
    if (this.hls && this.audioListener) this.hls.off('hlsBufferCodecs', this.audioListener);
    this.hls = null;
  }

  seekMedia = (retrying = false) => {
    if (!this.media || !this.props.currentRoute) return;
    if (!retrying) this.seekAttempts = 0;
    const seconds = Math.max(0, (currentOffset(this.props) - (this.props.currentRoute.videoStartOffset || 0)) / 1000);
    this.pendingSeek = true;
    this.props.dispatch(bufferVideo(true));
    if (this.media.readyState === 0) return; // HLS manifest can arrive before metadata.
    const wasEnded = this.media.ended;
    // Native currentTime keeps the latest command even during rapid scrubbing.
    this.seekTarget = Math.min(seconds, Number.isFinite(this.media.duration) ? this.media.duration : seconds);
    if (!this.media.seeking && Math.abs(this.media.currentTime - this.seekTarget) < 0.01) {
      this.onSeeked(); // A seek to the existing position need not emit seeked.
    } else {
      this.media.currentTime = this.seekTarget;
    }
    if (wasEnded && this.props.desiredPlaySpeed) {
      const media = this.media;
      const route = this.props.currentRoute.fullname;
      const retry = this.state.retry;
      media.play()?.catch((error) => {
        if (this.media === media) this.onError(error, null, route, retry);
      });
    }
  };

  publishPosition = () => {
    if (!this.media || this.state.videoError || this.pendingSeek || this.media.seeking) return;
    const { currentRoute, loop, dispatch, seekRevision } = this.props;
    const offset = this.media.currentTime * 1000 + (currentRoute.videoStartOffset || 0);
    if (!Number.isFinite(offset)) return;
    if (!this.media.paused && this.props.desiredPlaySpeed && loop && loop.duration > 0 && offset >= loop.startTime + loop.duration) {
      this.pendingSeek = true;
      dispatch(restartLoop(Math.max(loop.startTime, currentRoute.videoStartOffset || 0)));
      return;
    }
    dispatch(videoProgress(currentRoute.fullname, offset, seekRevision || 0));
  };

  onSeeked = () => {
    if (!this.media || this.media.seeking) return;
    if (this.pendingSeek && Math.abs(this.media.currentTime - this.seekTarget) > 0.5) {
      // Native HLS can finish its startup seek at zero after accepting our
      // target. Reapply the latest command instead of waiting for an event
      // that may never arrive; keep failures bounded and recoverable. Smaller
      // differences are hls.js skipping a gap between fragments, not a miss.
      this.seekAttempts += 1;
      if (this.seekAttempts <= 3) this.seekMedia(true);
      else this.onError(new Error('Seek did not complete'), null, this.props.currentRoute.fullname, this.state.retry);
      return;
    }
    this.pendingSeek = false;
    this.publishPosition();
    if (this.media?.readyState >= 2) this.props.dispatch(bufferVideo(false));
  };

  onReady = (player, route, retry) => {
    if (route !== this.props.currentRoute?.fullname || retry !== this.state.retry || player !== this.videoPlayer.current) return;
    const media = player.getInternalPlayer();
    if (media && media === this.media) return; // Native canplay may report ready repeatedly.
    this.detachMedia();
    this.media = media;
    if (!this.media) return;
    const listen = (event, callback, target = this.media) => {
      const listener = () => {
        if (this.media === media && retry === this.state.retry && !this.state.videoError
          && route === this.props.currentRoute?.fullname) callback();
      };
      target.addEventListener(event, listener);
      this.listeners.push([target, event, listener]);
    };
    listen('loadedmetadata', this.seekMedia);
    listen('timeupdate', this.publishPosition);
    listen('seeking', () => this.props.dispatch(bufferVideo(true)));
    listen('waiting', () => this.props.dispatch(bufferVideo(true)));
    listen('stalled', () => {
      if (this.media.readyState < 3) this.props.dispatch(bufferVideo(true));
    });
    listen('seeked', this.onSeeked);
    listen('canplay', () => { if (!this.pendingSeek) this.props.dispatch(bufferVideo(false)); });
    listen('playing', () => {
      if (this.media.paused) return;
      if (!this.pendingSeek) this.props.dispatch(bufferVideo(false));
      // Native controls, PWA background/resume and iOS audio policy can change
      // playback without a Redux command. Reflect the actual media state.
      if (!this.props.desiredPlaySpeed) this.props.dispatch(play(this.media.playbackRate || 1));
    });
    listen('pause', () => {
      if (!this.media.ended) {
        this.publishPosition();
        this.props.dispatch(pause());
      }
    });
    listen('ended', () => {
      this.publishPosition();
      const { loop, currentRoute, dispatch } = this.props;
      const start = Math.max(loop?.startTime || 0, currentRoute.videoStartOffset || 0);
      const end = this.media.duration * 1000 + (currentRoute.videoStartOffset || 0);
      if (this.props.desiredPlaySpeed && loop?.duration > 0 && start < end) {
        if (!this.pendingSeek) dispatch(restartLoop(start));
      } else {
        dispatch(pause());
      }
    });
    const reportAudio = (hlsAudio = false) => {
      if (!this.hasAudio && (hlsAudio || this.media?.audioTracks?.length
        || this.media?.mozHasAudio || this.media?.webkitAudioDecodedByteCount > 0)) {
        this.hasAudio = true;
        this.props.onAudioStatusChange?.(true);
      }
    };
    listen('loadeddata', reportAudio);
    listen('timeupdate', reportAudio);
    if (this.media.audioTracks?.addEventListener) listen('addtrack', reportAudio, this.media.audioTracks);
    reportAudio();
    this.hls = player.getInternalPlayer('hls');
    if (this.hls) {
      const hls = this.hls;
      reportAudio(Boolean(hls.audioTracks?.length || hls.levels?.some((level) => level.audioCodec)));
      this.audioListener = (_event, data) => {
        if (this.hls === hls && retry === this.state.retry && data?.audio) reportAudio(true);
      };
      this.hls.on('hlsBufferCodecs', this.audioListener);
    }
    this.seekMedia();
    // Publish every presented frame so the timeline, map and clip boundaries
    // follow the picture; timeupdate (~250ms apart) remains the fallback.
    const onFrame = () => {
      if (this.media !== media) return;
      this.publishPosition();
      this.frameRequest = media.requestVideoFrameCallback(onFrame);
    };
    this.frameRequest = media.requestVideoFrameCallback?.(onFrame) ?? null;
  };

  onError = (error, data, route, retry) => {
    if (route !== this.props.currentRoute?.fullname || retry !== this.state.retry || error?.name === 'AbortError') return;
    if (error === 'hlsError' && !data?.fatal) return;
    if (error?.name === 'NotAllowedError') {
      if (this.media && !this.media.paused) return; // A newer play attempt already succeeded.
      this.props.dispatch(pause());
      this.props.dispatch(bufferVideo(false));
      return;
    }
    this.publishPosition();
    this.props.dispatch(bufferVideo(false));
    this.setState({ videoError: HTTP_ERRORS[(data || error)?.response?.code]
      || 'Unable to load video. Check your connection and try again.' });
  };

  retry = () => {
    this.detachMedia();
    this.props.onAudioStatusChange?.(false);
    this.props.dispatch(bufferVideo(true));
    this.setState(({ retry }) => ({ retry: retry + 1, videoError: null }));
  };

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted, hidden } = this.props;
    const { videoError, retry } = this.state;
    const route = currentRoute?.fullname;
    const src = currentRoute && api.video.getQcameraStreamUrl(route, currentRoute.share_exp, currentRoute.share_sig);
    // A hidden player stays mounted and keeps playing so it can drive the map.
    return (
      <>
        {hidden && videoError && <VideoErrorBanner error={videoError} onRetry={this.retry} />}
        <div inert={hidden ? '' : undefined} className={hidden ? 'absolute w-px h-px overflow-hidden opacity-0 pointer-events-none' : undefined}>
          <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] overflow-hidden rounded-lg bg-[#16181A]">
            {!hidden && <VideoOverlay loading={isBufferingVideo && !videoError} error={videoError} onRetry={this.retry} />}
            {src && <ReactPlayer
              key={`${route}:${src}:${retry}`}
              ref={this.videoPlayer}
              url={src}
              playsinline
              muted={isMuted}
              width="100%"
              height="100%"
              playing={Boolean(desiredPlaySpeed && !videoError)}
              playbackRate={Math.min(isFirefox() && !isMuted ? 8 : 16, desiredPlaySpeed || 1)}
              onReady={(player) => this.onReady(player, route, retry)}
              onError={(error, data) => this.onError(error, data, route, retry)}
              config={{ hlsVersion: '1.4.8', hlsOptions: { maxBufferLength: 40 } }}
            />}
          </div>
        </div>
      </>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRevision: state.seekRevision,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
