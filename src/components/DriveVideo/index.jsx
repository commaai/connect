import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress } from '@material-ui/core';
import Hls from 'hls.js';

import { api } from '../../api/backend';
import { bufferVideo, pause, play, releaseVideo, videoTime } from '../../timeline/playback';
import { isFirefox, isIos } from '../../utils/browser';

function sourceUrl({ currentRoute }) {
  if (!currentRoute?.fullname) return null;
  return api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
}

export class DriveVideo extends Component {
  video = React.createRef();
  state = { loading: true, error: null, blocked: false };
  generation = 0;
  mounted = false;
  frame = null;
  pendingPlay = null;
  lastFrame = 0;

  componentDidMount() {
    this.mounted = true;
    this.loadSource();
  }

  componentDidUpdate(previous) {
    if (sourceUrl(previous) !== sourceUrl(this.props)) {
      this.loadSource();
      return;
    }
    if (previous.seekRevision !== this.props.seekRevision
      || previous.currentRoute?.videoStartOffset !== this.props.currentRoute?.videoStartOffset) this.seekVideo();
    if (previous.loop !== this.props.loop) this.seekVideo(this.routeTime());
    if (previous.desiredPlaySpeed !== this.props.desiredPlaySpeed || previous.isMuted !== this.props.isMuted) {
      this.applyPlayback();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.clearSource();
    this.props.dispatch(releaseVideo());
  }

  clearSource() {
    this.generation += 1;
    this.stopFrames();
    this.pendingPlay = null;
    this.hls?.destroy();
    this.hls = null;
  }

  loadSource = () => {
    this.failed = false;
    this.sourceLoading = true;
    this.clearSource();
    const src = sourceUrl(this.props);
    const video = this.video.current;
    this.pendingOffset = this.props.offset ?? this.props.currentRoute?.videoStartOffset ?? 0;
    this.setState({ loading: !!src, error: src ? null : 'No video is available for this drive.', blocked: false });
    this.props.onAudioStatusChange?.(false);
    if (!src || !video) {
      this.props.dispatch(releaseVideo());
      return;
    }
    this.props.dispatch(videoTime(Math.max(0, this.props.offset ?? this.props.currentRoute.videoStartOffset ?? 0)));
    this.props.dispatch(bufferVideo(true));
    this.recoveredMedia = false;
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl');
    const webkit = /AppleWebKit/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Android/i.test(navigator.userAgent);
    if (nativeHls && (isIos() || webkit || !Hls.isSupported())) {
      video.src = src;
      video.load();
    } else if (Hls.isSupported()) {
      const generation = this.generation;
      this.hls = new Hls({ maxBufferLength: 40 });
      this.hls.on(Hls.Events.MEDIA_DETACHING, () => {
        if (generation !== this.generation) return;
        this.sourceLoading = true;
        this.pendingOffset ??= this.props.offset ?? this.routeTime();
        this.pendingPlay = null;
        this.stopFrames();
      });
      this.hls.on(Hls.Events.BUFFER_CODECS, (event, tracks) => {
        if (generation === this.generation) this.props.onAudioStatusChange?.(!!tracks.audio);
      });
      this.hls.on(Hls.Events.ERROR, (event, error) => {
        if (generation !== this.generation || this.failed || !error.fatal) return;
        if (error.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recoveredMedia) {
          this.recoveredMedia = true;
          this.sourceLoading = true;
          this.pendingOffset = this.routeTime();
          this.pendingPlay = null;
          this.stopFrames();
          this.setState({ loading: true });
          this.props.dispatch(bufferVideo(true));
          try {
            this.hls.recoverMediaError();
          } catch {
            this.fail('Unable to recover video. Try again.');
          }
        } else {
          this.fail(error.response?.code === 404
            ? 'This video has not uploaded yet or has been deleted.'
            : 'Unable to load video. Check your connection and try again.');
        }
      });
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
    } else {
      this.fail('Video playback is not supported by this browser.');
    }
  };

  routeTime = () => (this.video.current?.currentTime || 0) * 1000 + (this.props.currentRoute?.videoStartOffset || 0);

  bounds() {
    const start = this.props.currentRoute?.videoStartOffset || 0;
    const duration = this.video.current?.duration;
    const end = Number.isFinite(duration) ? start + duration * 1000 : Infinity;
    const loop = this.props.loop;
    const loopStart = loop?.startTime;
    if (Number.isFinite(loopStart) && loop.duration > 0) {
      const lower = Math.max(start, loopStart);
      const upper = Math.min(end, loopStart + loop.duration);
      if (upper > lower) return [lower, upper, true];
    }
    return [start, end, false];
  }

  seekVideo(offset = this.props.offset) {
    const video = this.video.current;
    if (!Number.isFinite(offset)) return;
    this.pendingPlay = null;
    this.pendingOffset = offset;
    if (!video?.readyState) return;
    const [start, end] = this.bounds();
    const target = (Math.max(start, Math.min(end, offset)) - (this.props.currentRoute?.videoStartOffset || 0)) / 1000;
    if (Math.abs(video.currentTime - target) > 0.001) video.currentTime = target;
    this.pendingOffset = null;
    this.publishTime();
  }

  publishTime = () => {
    const video = this.video.current;
    if (!this.mounted || this.failed || !video?.readyState || this.pendingOffset != null) return;
    const [start, end, looping] = this.bounds();
    const offset = this.routeTime();
    if (looping && (offset >= end || offset < start)) {
      video.currentTime = (start - (this.props.currentRoute?.videoStartOffset || 0)) / 1000;
    }
    this.props.dispatch(videoTime(this.routeTime()));
  };

  stopFrames() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  updateFrame = (timestamp) => {
    if (!this.mounted || this.video.current?.paused || this.video.current?.seeking) {
      this.frame = null;
      return;
    }
    if (timestamp - this.lastFrame >= 100) {
      this.lastFrame = timestamp;
      this.publishTime();
    }
    this.frame = requestAnimationFrame(this.updateFrame);
  };

  applyPlayback() {
    const video = this.video.current;
    if (!video?.readyState) return;
    const speed = this.props.desiredPlaySpeed;
    if (!speed) {
      this.pendingPlay = null;
      video.pause();
      return;
    }
    const rate = Math.min(isFirefox() && !this.props.isMuted ? 8 : 16, Math.max(0.0625, speed));
    if (video.playbackRate !== rate) {
      try {
        video.playbackRate = rate;
      } catch {
        video.playbackRate = 1;
        this.props.dispatch(play(1));
      }
    }
    if (video.paused) this.tryPlay();
  }

  tryPlay = () => {
    const video = this.video.current;
    if (!video || this.pendingPlay || this.failed) return;
    const generation = this.generation;
    const pending = Promise.resolve(video.play());
    this.pendingPlay = pending;
    pending.catch(error => {
      if (!this.mounted || generation !== this.generation || this.pendingPlay !== pending || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        this.setState({ blocked: true, loading: false });
        this.props.dispatch(pause());
      } else {
        this.fail('Unable to play video. Try again.');
      }
    }).finally(() => {
      if (this.pendingPlay === pending) this.pendingPlay = null;
    });
  };

  playVideo = () => {
    this.setState({ blocked: false });
    this.props.dispatch(play(this.video.current?.playbackRate || 1));
    this.tryPlay();
  };

  fail(message) {
    if (!this.mounted || this.failed) return;
    this.failed = true;
    this.stopFrames();
    this.sourceLoading = true;
    this.pendingPlay = null;
    this.setState({ error: message, loading: false });
    this.video.current?.pause();
    this.props.dispatch(bufferVideo(true));
  }

  onMetadata = () => {
    this.sourceLoading = false;
    this.seekVideo(this.pendingOffset ?? this.props.offset);
    this.onReady();
  };

  onReady = () => {
    if (!this.hls) this.props.onAudioStatusChange?.(!!this.video.current?.audioTracks?.length);
    if (!this.video.current?.seeking && !this.state.blocked && !this.failed) {
      this.setState({ loading: false });
      this.props.dispatch(bufferVideo(false));
      this.applyPlayback();
      if (!this.video.current.paused && this.frame === null) this.frame = requestAnimationFrame(this.updateFrame);
    }
  };

  onPlaying = () => {
    if (!this.mounted || this.failed || this.video.current?.paused) return;
    this.sourceLoading = false;
    this.setState({ loading: false, blocked: false });
    this.props.dispatch(bufferVideo(false));
    this.publishTime();
    if (!this.props.desiredPlaySpeed) this.props.dispatch(play(this.video.current.playbackRate));
    if (this.frame === null) this.frame = requestAnimationFrame(this.updateFrame);
  };

  onWaiting = () => {
    this.stopFrames();
    this.publishTime();
    this.setState({ loading: true });
    this.props.dispatch(bufferVideo(true));
  };

  onPause = () => {
    if (!this.mounted || !this.video.current?.paused) return;
    this.stopFrames();
    this.publishTime();
    const video = this.video.current;
    if (!this.sourceLoading && !this.failed && !video?.ended && this.props.desiredPlaySpeed) {
      this.props.dispatch(pause());
    }
  };

  onEnded = () => {
    if (!this.mounted || this.failed || !this.video.current?.ended) return;
    this.stopFrames();
    this.publishTime();
    if (this.bounds()[2] && this.props.desiredPlaySpeed) this.tryPlay();
    else this.props.dispatch(pause());
  };

  onRateChange = () => {
    const rate = this.video.current?.playbackRate;
    if (this.props.desiredPlaySpeed && Number.isFinite(rate) && rate > 0 && rate !== this.props.desiredPlaySpeed) {
      this.props.dispatch(play(rate));
    }
  };

  onVolumeChange = () => {
    const muted = this.video.current?.muted;
    if (muted !== this.props.isMuted) this.props.onMuteChange?.(muted);
  };

  onError = () => {
    if (!this.hls) this.fail('Unable to load video. Check your connection and try again.');
  };

  render() {
    const { loading, error, blocked } = this.state;
    return (
      <div className="relative m-[0_auto] aspect-[1.593] max-w-[964px] overflow-hidden rounded-lg bg-black">
        <video key={sourceUrl(this.props)} ref={this.video} aria-label="Drive video" className="h-full w-full" controls playsInline muted={this.props.isMuted} preload="metadata"
          onLoadedMetadata={this.onMetadata} onCanPlay={this.onReady} onPlaying={this.onPlaying} onWaiting={this.onWaiting}
          onSeeking={() => { this.pendingPlay = null; this.onWaiting(); }} onSeeked={() => { this.publishTime(); this.onReady(); }} onTimeUpdate={this.publishTime}
          onPause={this.onPause} onEnded={this.onEnded} onRateChange={this.onRateChange} onVolumeChange={this.onVolumeChange} onError={this.onError} />
        {(error || blocked || loading) && <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 p-6 text-center text-white ${!error && !blocked ? 'pointer-events-none' : ''}`}>
          {error || blocked ? <><p role={error ? 'alert' : 'status'}>{error || 'Tap to play this drive.'}</p><button type="button" className="rounded-full border border-white/30 bg-white/10 px-5 py-2 text-sm font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white" onClick={error ? this.loadSource : this.playVideo}>{error ? 'Retry video' : 'Play video'}</button></>
            : <CircularProgress aria-label="Loading video" style={{ color: 'white' }} size={32} />}
        </div>}
      </div>
    );
  }
}

export default connect(state => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRevision: state.seekRevision,
  loop: state.loop,
}))(DriveVideo);
