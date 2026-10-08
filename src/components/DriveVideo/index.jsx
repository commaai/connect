import React, { Component } from 'react';
import { connect } from 'react-redux';

import { api } from '../../api/backend';
import { ErrorOutline, PlayArrow, Refresh } from '../../icons';
import { currentOffset, registerPlayer } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';
import Spinner from '../utils/Spinner';
import { offsetToVideoTime, parsePlaylist, videoTimeToOffset } from './playlist';

const MISSING_VIDEO = 'Video for this part of the drive has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check your network connection.';
const PLAYBACK_ERROR = 'Unable to play video.';

const LOOP_SLACK = 100;
const MAX_MEDIA_ERRORS = 5;
const STALL_TIMEOUT = 2000;

// hls.js stops loading a fragment tagged EXT-X-GAP and skips over it
function markGap(frag) {
  frag.gap = true;
  frag.tagList.push(['GAP']);
}

const isMissing = (status) => status === 401 || status === 403 || status === 404 || status === 410;

async function fetchPlaylist(src) {
  const resp = await fetch(src);
  if (!resp.ok) {
    throw Object.assign(new Error(`playlist request failed: ${resp.status}`), { status: resp.status });
  }
  return resp.text();
}

const VideoOverlay = ({ loading, error, paused, onRetry }) => {
  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#16181AE0] p-6 text-center">
        <ErrorOutline className="text-white/60" />
        <p className="max-w-xs text-sm text-white/80">{error}</p>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          onClick={onRetry}
        >
          <Refresh className="!h-4 !w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className={`transition-opacity ${loading ? 'opacity-100 delay-200 duration-300' : 'opacity-0 duration-150'}`}
        aria-hidden={!loading}
      >
        <Spinner className="h-11 w-11 border-white/80" label="Loading video" />
      </div>
      <div
        className={`absolute flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all duration-200
          ${paused && !loading ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
      >
        <PlayArrow className="!h-8 !w-8 text-white" />
      </div>
    </div>
  );
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.video = React.createRef();
    this.hls = null;
    this.loadId = 0;
    this.segments = [];
    this.pendingOffset = null;
    this.unregister = null;

    this.state = {
      error: null,
      loading: true,
    };

    this.onEnded = this.onEnded.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.jumpStalledGap = this.jumpStalledGap.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPlayRejected = this.onPlayRejected.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.retry = this.retry.bind(this);
    this.tick = this.tick.bind(this);
    this.togglePlay = this.togglePlay.bind(this);
    this.updateLoading = this.updateLoading.bind(this);
  }

  componentDidMount() {
    this.video.current.muted = this.props.isMuted;
    document.addEventListener('keydown', this.onKeyDown);
    this.stallCheck = setInterval(this.jumpStalledGap, 500);
    this.load();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, isMuted, loop } = this.props;
    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      this.load();
    } else if (prevProps.loop !== loop) {
      this.keepInLoop();
    }
    if (prevProps.isMuted !== isMuted) {
      this.video.current.muted = isMuted;
    }
    this.syncPlayback();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.onKeyDown);
    clearInterval(this.stallCheck);
    this.loadId += 1;
    this.unregister?.();
    cancelAnimationFrame(this.raf);
    this.teardown();
  }

  isLoaded() {
    return this.pendingOffset === null && this.video.current?.readyState > 0;
  }

  videoTime(offset) {
    return offsetToVideoTime(this.segments, this.props.currentRoute?.videoStartOffset || 0, offset);
  }

  getOffset() {
    if (!this.isLoaded()) {
      return this.pendingOffset ?? 0;
    }
    return videoTimeToOffset(this.segments, this.props.currentRoute?.videoStartOffset || 0, this.video.current.currentTime);
  }

  seekTo(offset) {
    if (this.isLoaded()) {
      const video = this.video.current;
      const time = this.videoTime(offset);
      const buffered = [...Array(video.buffered.length).keys()].some((i) => video.buffered.start(i) <= time && time < video.buffered.end(i));
      if (this.hls && !buffered) {
        // restart loading so hls.js drops what it parsed of the old position, leftovers make it reload the previous segment
        this.hls.stopLoad();
        video.currentTime = time;
        this.hls.startLoad(time);
      } else {
        video.currentTime = time;
      }
    } else {
      this.pendingOffset = offset;
      if (this.hls?.levels?.length) {
        this.hls.startLoad(this.videoTime(offset));
      }
    }
  }

  teardown() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
      URL.revokeObjectURL(this.playlistUrl);
    }
    const video = this.video.current;
    if (video?.getAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }

  async load(startOffset) {
    const { currentRoute, loop, onAudioStatusChange } = this.props;
    this.loadId += 1;
    const { loadId } = this;
    this.teardown();
    this.mediaErrors = 0;
    this.failedSn = null;
    this.segments = [];
    this.pendingOffset = startOffset ?? loop?.startTime ?? 0;
    this.setState({ error: null, loading: true });
    onAudioStatusChange?.(false);
    if (!currentRoute) {
      this.unregister?.();
      this.unregister = null;
      return;
    }
    if (!this.unregister) {
      this.unregister = registerPlayer(this);
    }

    const video = this.video.current;
    const canPlayNative = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    const useNative = isIos() && canPlayNative;

    let src;
    let playlist;
    let Hls = null;
    try {
      src = await api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      [playlist, Hls] = await Promise.all([
        fetchPlaylist(src),
        useNative ? null : import('hls.js/light').then((module) => module.default),
      ]);
    } catch (err) {
      if (loadId === this.loadId) {
        this.fail(isMissing(err.status) ? MISSING_VIDEO : NETWORK_ERROR);
      }
      return;
    }
    if (loadId !== this.loadId) {
      return;
    }
    this.segments = parsePlaylist(playlist);
    if (!this.segments.length) {
      this.fail(MISSING_VIDEO);
      return;
    }

    if (Hls?.isSupported()) {
      this.Hls = Hls;
      this.hls = new Hls({
        maxBufferLength: 40,
        progressive: true,
        startPosition: this.videoTime(this.pendingOffset),
      });
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.on(Hls.Events.BUFFER_CODECS, (_, data) => onAudioStatusChange?.(Boolean(data.audio)));
      // reuse the fetched playlist instead of loading it twice
      this.playlistUrl = URL.createObjectURL(new Blob([playlist], { type: 'application/vnd.apple.mpegurl' }));
      this.hls.loadSource(this.playlistUrl);
      this.hls.attachMedia(video);
    } else if (canPlayNative) {
      video.src = src;
    } else {
      this.fail(PLAYBACK_ERROR);
      return;
    }

    this.syncPlayback();
  }

  syncPlayback() {
    const video = this.video.current;
    const { desiredPlaySpeed } = this.props;
    if (this.state.error || (!this.hls && !video.getAttribute('src'))) {
      return;
    }

    if (desiredPlaySpeed) {
      if (video.playbackRate !== desiredPlaySpeed) {
        video.defaultPlaybackRate = desiredPlaySpeed;
        video.playbackRate = desiredPlaySpeed;
      }
      if (video.paused && !video.ended) {
        video.play()?.catch(this.onPlayRejected);
      }
    } else if (!video.paused) {
      video.pause();
    }
  }

  keepInLoop() {
    const { loop } = this.props;
    const video = this.video.current;
    if (!loop || video.seeking) {
      return;
    }
    const offset = this.getOffset();
    if (offset < loop.startTime - LOOP_SLACK || offset > loop.startTime + loop.duration) {
      this.seekTo(loop.startTime);
    }
  }

  tick() {
    this.keepInLoop();
    if (!this.video.current.paused) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  // hls.js can get stuck while more video is buffered ahead, jump to it
  jumpStalledGap() {
    const video = this.video.current;
    if (!this.hls || !this.props.desiredPlaySpeed || !this.isLoaded() || video.readyState >= 3 || video.currentTime !== this.stalledAt?.time) {
      this.stalledAt = { time: video.currentTime, since: Date.now() };
      return;
    }
    if (Date.now() - this.stalledAt.since < STALL_TIMEOUT) {
      return;
    }
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) > video.currentTime) {
        video.currentTime = video.buffered.start(i);
        return;
      }
    }
  }

  updateLoading() {
    const video = this.video.current;
    const loading = video.seeking || (video.readyState < 3 && !video.ended && !(video.paused && video.readyState >= 2));
    if (loading !== this.state.loading) {
      this.setState({ loading });
    }
  }

  fail(error) {
    const offset = this.getOffset();
    this.teardown();
    this.unregister?.();
    this.unregister = null;
    this.setState({ error, loading: false });
    this.props.dispatch(seek(offset));
  }

  retry() {
    this.load(currentOffset());
  }

  togglePlay() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (this.state.error) {
      return;
    }
    if (desiredPlaySpeed) {
      dispatch(pause());
    } else {
      // iOS only allows play() from a user gesture
      this.video.current.play()?.catch(this.onPlayRejected);
    }
  }

  onKeyDown(ev) {
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey
      || ev.target.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]')) {
      return;
    }
    if (ev.key === ' ' || ev.key === 'k') {
      this.togglePlay();
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      this.props.dispatch(seek(currentOffset() + (ev.key === 'ArrowLeft' ? -10000 : 10000)));
    } else {
      return;
    }
    ev.preventDefault();
  }

  onLoadedMetadata() {
    const video = this.video.current;
    if (this.pendingOffset !== null) {
      const target = this.videoTime(this.pendingOffset);
      this.pendingOffset = null;
      if (Math.abs(video.currentTime - target) > 0.1) {
        video.currentTime = target;
      }
    }
    if (!this.hls) {
      this.props.onAudioStatusChange?.(Boolean(video.audioTracks?.length));
    }
    this.keepInLoop();
    this.syncPlayback();
  }

  onPlaying() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    this.updateLoading();
  }

  onTimeUpdate() {
    if (this.isLoaded()) {
      this.lastOffset = this.getOffset();
    }
    this.keepInLoop();
    this.updateLoading();
  }

  onPause() {
    const video = this.video.current;
    this.updateLoading();
    if (!video.ended && !video.error && video.readyState > 0 && this.props.desiredPlaySpeed) {
      this.props.dispatch(pause());
    }
  }

  onPlay() {
    if (!this.props.desiredPlaySpeed) {
      this.props.dispatch(play(this.video.current.playbackRate || 1));
    }
  }

  onPlayRejected(err) {
    if (err?.name === 'NotAllowedError') {
      this.props.dispatch(pause());
    }
  }

  onEnded() {
    const { loop } = this.props;
    const video = this.video.current;
    const loopStart = this.videoTime(loop?.startTime ?? 0);
    if (loopStart < video.duration - 0.5) {
      video.currentTime = loopStart;
      video.play()?.catch(this.onPlayRejected);
    } else {
      this.props.dispatch(pause());
    }
  }

  onVideoError() {
    const { error } = this.video.current;
    if (this.hls || !error || !this.video.current.getAttribute('src')) {
      return;
    }
    this.fail(error.code === error.MEDIA_ERR_NETWORK ? NETWORK_ERROR : PLAYBACK_ERROR);
  }

  onHlsError(_, data) {
    const { ErrorDetails, ErrorTypes } = this.Hls;
    const missing = isMissing(data.response?.code);
    if (missing && data.details === ErrorDetails.FRAG_LOAD_ERROR && data.frag) {
      markGap(data.frag);
      return;
    }

    const reset = data.details === ErrorDetails.MEDIA_SOURCE_REQUIRES_RESET;
    if (reset || (data.fatal && data.type === ErrorTypes.MEDIA_ERROR)) {
      this.recoverMedia(data.frag, reset);
      return;
    }
    if (!data.fatal) {
      return;
    }

    if (missing || data.details === ErrorDetails.LEVEL_EMPTY_ERROR || data.details === ErrorDetails.MANIFEST_PARSING_ERROR) {
      this.fail(MISSING_VIDEO);
    } else {
      this.fail(data.type === ErrorTypes.NETWORK_ERROR ? NETWORK_ERROR : PLAYBACK_ERROR);
    }
  }

  recoverMedia(frag, hlsRecovers) {
    if (this.mediaErrors >= MAX_MEDIA_ERRORS) {
      this.fail(PLAYBACK_ERROR);
      return;
    }
    this.mediaErrors += 1;
    // a segment that fails to decode twice is broken
    if (frag && frag.sn === this.failedSn) {
      markGap(frag);
    }
    this.failedSn = frag?.sn;
    // keep the position while the video reloads
    if (this.pendingOffset === null) {
      this.pendingOffset = this.lastOffset;
    }
    if (!hlsRecovers) {
      this.hls.recoverMediaError();
    }
  }

  render() {
    const { desiredPlaySpeed } = this.props;
    const { error, loading } = this.state;

    return (
      <div className="relative m-[0_auto] aspect-[1.593] min-h-[200px] max-w-[964px] overflow-hidden bg-black">
        <video
          ref={this.video}
          className="h-full w-full cursor-pointer object-contain"
          playsInline
          preload="auto"
          onClick={this.togglePlay}
          onEnded={this.onEnded}
          onError={this.onVideoError}
          onLoadedData={this.updateLoading}
          onLoadedMetadata={this.onLoadedMetadata}
          onPause={this.onPause}
          onPlay={this.onPlay}
          onPlaying={this.onPlaying}
          onSeeked={this.updateLoading}
          onSeeking={this.updateLoading}
          onTimeUpdate={this.onTimeUpdate}
          onWaiting={this.updateLoading}
        />
        <VideoOverlay loading={loading} error={error} paused={!desiredPlaySpeed} onRetry={this.retry} />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
