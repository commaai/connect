import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, PlayArrow, RefreshIcon } from '../../icons';
import { attachVideo, currentOffset, seekVideo, videoOffset } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

const STALL_TIMEOUT = 15000;

const ERRORS = {
  missing: 'This video segment has not uploaded yet or has been deleted.',
  missingPart: 'This part of the drive has not uploaded yet or has been deleted.',
  noAccess: 'This video link has expired, or you no longer have access to it.',
  offline: 'You\'re offline. The video will continue when you reconnect.',
  network: 'Unable to load video. Check network connection.',
  slow: 'The video is taking too long to load.',
  unplayable: 'Unable to play this video.',
};

// iOS and iPadOS play HLS natively, everything else gets hls.js
function hasNativeHls() {
  return isIos() || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

// the video element can't tell why a stream failed, so ask the server
async function loadFailure(src) {
  try {
    const { ok, status } = await fetch(src);
    if (status === 401 || status === 403) return ERRORS.noAccess;
    if (status === 404 || status === 410) return ERRORS.missing;
    return ok ? ERRORS.unplayable : ERRORS.network;
  } catch {
    return navigator.onLine ? ERRORS.network : ERRORS.offline;
  }
}

const VideoOverlay = ({ loading, error, needsTap, onRetry, onPlay }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button
          className="mt-3 flex items-center gap-2 rounded-3xl px-6 py-1.5 text-white text-sm font-medium normal-case bg-white/10 hover:bg-white/20"
          onClick={onRetry}
          disableRipple
        >
          <RefreshIcon style={{ fontSize: 20 }} />
          Retry
        </Button>
      </>
    );
  } else if (needsTap) {
    content = (
      <Button className="rounded-full p-3 text-white bg-white/10 hover:bg-white/20" onClick={onPlay} aria-label="Play">
        <PlayArrow style={{ fontSize: 48 }} />
      </Button>
    );
  } else if (loading) {
    // short stalls resolve before the spinner fades in
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className={`z-50 absolute h-full w-full flex flex-col items-center justify-center px-4 text-center bg-[#16181AAA] ${error || needsTap ? '' : 'animate-[fadein_0.25s_0.4s_both]'}`}>
      {content}
    </div>
  );
};

class DriveVideo extends Component {
  video = React.createRef();
  hls = null;
  loadId = 0;
  state = { loading: true, error: null, needsTap: false };

  componentDidMount() {
    const video = this.video.current;
    video.muted = this.props.isMuted;
    if (video.audioTracks) {
      // iOS can add the audio track after the video is ready to play
      video.audioTracks.onaddtrack = () => this.props.onAudioStatusChange?.(true);
    }
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.load();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, desiredPlaySpeed, isMuted, loop, offset } = this.props;
    const video = this.video.current;
    if (currentRoute?.fullname !== prevProps.currentRoute?.fullname) {
      this.load();
      return;
    }

    const startShift = (currentRoute?.videoStartOffset || 0) - (prevProps.currentRoute?.videoStartOffset || 0);
    if (startShift && videoOffset(this.props) !== null) {
      // the start offset can arrive after the video loaded, stay at the same point in the drive
      video.currentTime = Math.max(0, video.currentTime - (startShift / 1000));
    }
    if (offset !== prevProps.offset && (this.failed || this.missingPart)) {
      // seeking away from a failure is the quickest way out of it
      this.reload();
      return;
    }
    if (loop !== prevProps.loop) {
      seekVideo(offset ?? 0, this.props);
    }
    if (isMuted !== prevProps.isMuted) {
      video.muted = isMuted;
    }
    if (desiredPlaySpeed !== prevProps.desiredPlaySpeed || isMuted !== prevProps.isMuted) {
      this.applyPlayback();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.onOnline);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    cancelAnimationFrame(this.frame);
    clearTimeout(this.stallTimer);
    this.unload();
  }

  onLoadedMetadata = () => {
    const video = this.video.current;
    attachVideo(video);
    seekVideo(this.props.offset ?? 0, this.props);
    if (video.audioTracks?.length) {
      this.props.onAudioStatusChange?.(true);
    }
    this.applyPlayback();
  };

  onPlay = () => {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (this.redrawing) return;
    if (this.state.needsTap) this.setState({ needsTap: false });
    if (!desiredPlaySpeed) {
      // started from outside the app, e.g. the lock screen or headphones
      dispatch(play(this.video.current.playbackRate));
    }
  };

  onPause = () => {
    const { desiredPlaySpeed, dispatch } = this.props;
    const video = this.video.current;
    if (desiredPlaySpeed && video.readyState && !video.ended && !this.failed) {
      // paused from outside the app, e.g. the lock screen, headphones or a background tab
      dispatch(pause());
    }
  };

  onPlaying = () => {
    this.setLoading(false);
    if (!this.frame) this.watchLoop();
  };

  onWaiting = () => {
    if (!this.failIfReachedMissingPart()) this.setLoading(true);
  };

  onProgress = () => {
    // data is still arriving, keep waiting
    if (this.state.loading) this.setLoading(true);
  };

  onEnded = () => {
    // the video can end before the loop does, start it over
    this.props.dispatch(seek(this.props.loop?.startTime ?? 0));
    this.applyPlayback();
  };

  onError = () => {
    const { error } = this.video.current;
    // hls.js reports its own errors, and code 1 means loading was aborted
    if (!this.hls && error && error.code !== 1) this.failLoad();
  };

  onHlsError = (_event, data) => {
    const status = data.response?.code;
    const notUploaded = status === 404 || status === 410;
    if (data.frag && data.type === 'networkError' && (data.fatal || notUploaded)) {
      // a segment is missing or failed to load, only say so once playback runs into it
      this.missingPart = { start: data.frag.start, notUploaded };
      this.failIfReachedMissingPart();
      return;
    }
    if (!data.fatal) {
      return; // hls.js retries these itself
    }
    if (data.type === 'mediaError' && !this.recoveredMedia) {
      this.recoveredMedia = true;
      this.hls.recoverMediaError();
    } else {
      this.failLoad();
    }
  };

  onPlayError = (err) => {
    if (err.name === 'NotAllowedError') {
      // autoplay was blocked, e.g. in iOS low power mode, wait for a tap
      this.setState({ needsTap: true });
      this.setLoading(false);
      this.props.dispatch(pause());
    }
  };

  onOnline = () => {
    if (this.failed) this.reload();
  };

  onVisibilityChange = () => {
    const video = this.video.current;
    if (document.hidden || !hasNativeHls() || !video.paused || !video.readyState || this.failed) {
      return;
    }
    // when the app comes back, iOS can show the wrong frame for a paused video until it plays,
    // seeking doesn't redraw it, so play for a moment and go back
    const id = this.loadId;
    const { currentTime } = video;
    this.redrawing = true;
    video.muted = true;
    video.play()?.then(() => {
      if (id !== this.loadId || this.props.desiredPlaySpeed) return;
      video.pause();
      video.currentTime = currentTime;
    }).catch(() => {}).finally(() => {
      this.redrawing = false;
      video.muted = this.props.isMuted;
    });
  };

  async load() {
    this.unload();
    const id = this.loadId;
    const video = this.video.current;
    const { currentRoute, onAudioStatusChange } = this.props;
    this.failed = false;
    this.missingPart = null;
    this.recoveredMedia = false;
    this.setState({ error: null, needsTap: false });
    onAudioStatusChange?.(false);
    if (!currentRoute) {
      return;
    }
    this.setLoading(true);

    this.src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    if (hasNativeHls()) {
      video.src = this.src;
      return;
    }

    let Hls;
    try {
      ({ default: Hls } = await import('hls.js/dist/hls.light.mjs'));
    } catch {
      this.fail(navigator.onLine ? ERRORS.network : ERRORS.offline);
      return;
    }
    if (id !== this.loadId) {
      return;
    }
    if (!Hls.isSupported()) {
      this.fail(ERRORS.unplayable);
      return;
    }
    this.hls = new Hls({
      maxBufferLength: 40,
      startPosition: Math.max(0, (currentOffset(this.props) - (currentRoute.videoStartOffset || 0)) / 1000),
    });
    this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
    this.hls.on(Hls.Events.ERROR, this.onHlsError);
    this.hls.loadSource(this.src);
    this.hls.attachMedia(video);
  }

  unload() {
    this.loadId += 1;
    attachVideo(null);
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    } else {
      this.video.current.removeAttribute('src');
      this.video.current.load();
    }
  }

  reload = () => {
    // pick up where playback stopped
    const offset = currentOffset(this.props);
    this.unload();
    this.props.dispatch(seek(offset));
    this.load();
  };

  async failLoad() {
    const id = this.loadId;
    const message = await loadFailure(this.src);
    if (id === this.loadId) this.fail(message);
  }

  failIfReachedMissingPart() {
    const { missingPart } = this;
    if (!missingPart || this.video.current.currentTime < missingPart.start - 1) {
      return false;
    }
    this.fail(missingPart.notUploaded ? ERRORS.missingPart : ERRORS.network);
    return true;
  }

  fail(error) {
    this.failed = true;
    this.hls?.stopLoad();
    this.setLoading(false);
    this.setState({ error: navigator.onLine ? error : ERRORS.offline });
  }

  setLoading(loading) {
    clearTimeout(this.stallTimer);
    if (loading) {
      this.stallTimer = setTimeout(() => this.fail(ERRORS.slow), STALL_TIMEOUT);
    }
    if (loading !== this.state.loading) this.setState({ loading });
  }

  applyPlayback() {
    const { desiredPlaySpeed, isMuted } = this.props;
    const video = this.video.current;
    if (!desiredPlaySpeed) {
      video.pause();
      return;
    }
    // most browsers don't support more than 16x, firefox mutes audio above 8x
    video.playbackRate = Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed);
    if (video.paused && video.readyState && !this.failed) {
      video.play()?.catch(this.onPlayError);
    }
  }

  checkLoop = () => {
    const { loop, desiredPlaySpeed, dispatch } = this.props;
    const offset = videoOffset(this.props);
    if (loop && desiredPlaySpeed && offset !== null && !this.video.current.seeking
      && offset >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }
  };

  // wrap the loop on the frame it ends, timeupdate covers background tabs
  watchLoop = () => {
    this.checkLoop();
    this.frame = this.video.current.paused ? null : requestAnimationFrame(this.watchLoop);
  };

  render() {
    const { loading, error, needsTap } = this.state;
    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={loading}
          error={error}
          needsTap={needsTap}
          onRetry={this.reload}
          onPlay={() => this.props.dispatch(play())}
        />
        <video
          ref={this.video}
          className="w-full h-full"
          playsInline
          preload="auto"
          onLoadedMetadata={this.onLoadedMetadata}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onPlaying={this.onPlaying}
          onWaiting={this.onWaiting}
          onSeeking={() => this.setLoading(true)}
          onSeeked={() => this.setLoading(false)}
          onCanPlay={() => this.setLoading(false)}
          onProgress={this.onProgress}
          onTimeUpdate={this.checkLoop}
          onEnded={this.onEnded}
          onError={this.onError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
