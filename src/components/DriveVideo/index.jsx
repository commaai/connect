import React, { Component } from 'react';
import { connect } from 'react-redux';
import Hls from 'hls.js';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import { api } from '../../api/backend';
import { isIos } from '../../utils/browser';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { pause, play, setPlaySpeed, videoPosition } from '../../timeline/playback';

export class Playback extends Component {
  video = React.createRef();
  state = { error: null, needsGesture: false, loading: false, unavailable: false };
  mounted = false;
  pendingSeek = null;
  frame = null;
  timeout = null;
  lastOffset = null;

  componentDidMount() {
    this.mounted = true;
    this.pendingSeek = this.props.seekOffset ?? this.props.offset ?? this.props.loop?.startTime ?? 0;
    this.loadSource();
  }

  componentDidUpdate(prev) {
    if (prev.seekRevision !== this.props.seekRevision) {
      this.pendingSeek = this.props.seekOffset;
      this.applySeek();
    }
    if (prev.desiredPlaySpeed !== this.props.desiredPlaySpeed || prev.isPlaying !== this.props.isPlaying) {
      this.applyPlayback();
      if (!this.props.isPlaying && !this.video.current.seeking && this.video.current.readyState >= 2) this.ready();
    }
    if (prev.currentRoute.videoStartOffset !== this.props.currentRoute.videoStartOffset) {
      // Route events can arrive after metadata. Keep the requested route time
      // when the camera/log offset becomes known.
      this.pendingSeek = this.pendingSeek ?? (this.video.current.seeking ? this.props.seekOffset : this.props.offset) ?? this.props.seekOffset ?? 0;
      this.applySeek();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.cleanup();
  }

  cleanup = () => {
    clearTimeout(this.timeout);
    clearTimeout(this.spinner);
    cancelAnimationFrame(this.frame);
    this.hls?.destroy();
    this.hls = null;
    const video = this.video.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };

  loading = (force = false) => {
    const video = this.video.current;
    if (!this.mounted || this.state.error || (force !== true && !this.props.isPlaying && !video.seeking && video.readyState >= 2)) return;
    if (!this.spinner && !this.state.loading) {
      this.spinner = setTimeout(() => {
        this.spinner = null;
        if (this.mounted) this.setState({ loading: true });
      }, 300);
    }
    if (!this.timeout) this.timeout = setTimeout(() => this.fail('Video is taking too long to load. Check your connection and retry.'), 20000);
  };

  ready = () => {
    const video = this.video.current;
    if (!this.mounted || video.readyState < 2 || video.seeking || this.pendingSeek !== null || this.state.error) return;
    clearTimeout(this.timeout);
    clearTimeout(this.spinner);
    this.timeout = this.spinner = null;
    if (!this.hls) this.props.onAudioStatusChange?.(Boolean(video.audioTracks?.length || video.mozHasAudio || video.webkitAudioDecodedByteCount));
    this.setState({ error: null, needsGesture: false, loading: false });
    this.publish();
  };

  fail = (error, needsGesture = false, unavailable = false) => {
    if (!this.mounted) return;
    this.retryOffset = this.pendingSeek ?? this.props.offset ?? this.props.seekOffset ?? 0;
    clearTimeout(this.timeout);
    clearTimeout(this.spinner);
    this.timeout = this.spinner = null;
    cancelAnimationFrame(this.frame);
    this.hls?.stopLoad();
    this.setState({ error, needsGesture, loading: false, unavailable });
    this.props.dispatch(pause());
  };

  loadSource = () => {
    const video = this.video.current;
    this.generation = (this.generation || 0) + 1;
    this.timeout = this.spinner = null;
    this.lastOffset = null;
    this.loading(true);
    this.recovered = false;
    this.props.onAudioStatusChange?.(false);
    // Some desktop browsers advertise native HLS but fail on these streams.
    // Keep the established MSE path there and native playback on iOS.
    const isIpad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (!isIos() && !isIpad && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 40, autoStartLoad: false });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.mounted && this.hls === hls) hls.startLoad(this.videoTime(this.pendingSeek ?? this.props.seekOffset ?? 0));
      });
      hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
        if (this.mounted && this.hls === hls) this.props.onAudioStatusChange?.(Boolean(data.audio));
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!this.mounted || this.hls !== hls || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recovered) {
          this.recovered = true;
          this.pendingSeek = this.props.offset ?? this.props.seekOffset ?? 0;
          this.loading();
          hls.recoverMediaError();
          hls.startLoad(this.videoTime(this.pendingSeek));
        } else {
          hls.stopLoad();
          this.fail([401, 403, 404, 410].includes(data.response?.code)
            ? 'This video segment has not uploaded yet or has been deleted.'
            : 'Unable to load video. Check your connection and retry.');
        }
      });
      hls.loadSource(this.props.src);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = this.props.src;
      video.load();
    } else {
      this.fail('Video playback is not supported by this browser.', false, true);
    }
  };

  videoTime = (offset) => Math.max(0, (offset - (this.props.currentRoute.videoStartOffset || 0)) / 1000);

  applySeek = () => {
    const video = this.video.current;
    if (!video || video.readyState === 0 || this.pendingSeek === null) return;
    const start = this.props.currentRoute.videoStartOffset || 0;
    const { loop } = this.props;
    if (loop && Number.isFinite(video.duration)
      && (loop.startTime >= start + video.duration * 1000 || loop.startTime + loop.duration <= start)) {
      this.fail('No video is available in this selected range.', false, true);
      return;
    }
    if (this.state.unavailable) this.setState({ unavailable: false, error: null });
    const target = this.videoTime(this.pendingSeek);
    try {
      video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, target);
    } catch {
      this.fail('Unable to seek video. Please retry.');
      return;
    }
    this.pendingSeek = null;
    // Seeking to the current position may not emit seeked.
    if (!video.seeking) this.ready();
  };

  metadata = () => {
    const video = this.video.current;
    if (!this.hls) this.props.onAudioStatusChange?.(Boolean(video.audioTracks?.length || video.mozHasAudio || video.webkitAudioDecodedByteCount));
    this.applySeek();
    this.applyPlayback();
  };

  applyPlayback = () => {
    const video = this.video.current;
    if (!video || !this.mounted || video.readyState === 0) return;
    const speed = this.props.desiredPlaySpeed;
    try {
      video.playbackRate = speed;
    } catch {
      this.props.dispatch(pause());
      this.fail('This playback speed is not supported by your browser.');
      return;
    }
    if (!this.props.isPlaying || this.pendingSeek !== null || (this.state.error && !this.state.needsGesture)) {
      video.pause();
      return;
    }
    if (video.paused && !this.state.error) {
      const generation = this.generation;
      video.play()?.catch((error) => {
        if (!this.mounted || generation !== this.generation || error.name === 'AbortError') return;
        this.fail(error.name === 'NotAllowedError' ? 'Tap Play to start video.' : 'Unable to play video. Please retry.', error.name === 'NotAllowedError');
      });
    }
  };

  publish = () => {
    const video = this.video.current;
    if (!this.mounted || !video || video.seeking || this.pendingSeek !== null || this.state.error) return;
    const offset = video.currentTime * 1000 + (this.props.currentRoute.videoStartOffset || 0);
    const { loop } = this.props;
    const start = Math.max(loop?.startTime ?? 0, this.props.currentRoute.videoStartOffset || 0);
    const videoEnd = Number.isFinite(video.duration) ? video.duration * 1000 + (this.props.currentRoute.videoStartOffset || 0) : Infinity;
    const end = loop ? Math.min(loop.startTime + loop.duration, videoEnd) : videoEnd;
    if (loop && this.props.isPlaying && end > start
      && (offset < start || offset >= end)) {
      this.pendingSeek = start;
      this.applySeek();
      return;
    }
    if (offset !== this.lastOffset) {
      this.lastOffset = offset;
      this.props.dispatch(videoPosition(this.props.currentRoute.fullname, offset, this.props.seekRevision));
    }
  };

  tick = (timestamp) => {
    if (!this.lastFrame || timestamp - this.lastFrame >= 50) {
      this.publish();
      this.lastFrame = timestamp;
    }
    if (this.mounted && !this.video.current.paused) this.frame = requestAnimationFrame(this.tick);
  };

  playing = () => {
    if (this.state.needsGesture) this.setState({ error: null, needsGesture: false }, this.ready);
    else this.ready();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  };

  ended = () => {
    const { loop, currentRoute, dispatch } = this.props;
    const start = Math.max(loop?.startTime ?? 0, currentRoute.videoStartOffset || 0);
    const video = this.video.current;
    if (loop && loop.startTime + loop.duration > start
      && (!Number.isFinite(video.duration) || (start - (currentRoute.videoStartOffset || 0)) / 1000 < video.duration)) {
      this.pendingSeek = start;
      this.applySeek();
      this.applyPlayback();
    } else {
      this.publish();
      dispatch(pause());
    }
  };

  retry = () => {
    const video = this.video.current;
    if (this.state.needsGesture) {
      this.props.dispatch(play());
      video.play()?.catch(() => this.fail('Tap Play to start video.', true));
    } else {
      this.pendingSeek = this.retryOffset ?? this.props.offset ?? this.props.seekOffset ?? 0;
      this.cleanup();
      this.setState({ error: null, needsGesture: false, unavailable: false, loading: false }, () => {
        this.loadSource();
        this.props.dispatch(play());
      });
    }
  };

  render() {
    const { isMuted, hidden, dispatch } = this.props;
    const { error, needsGesture, loading, unavailable } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
        <video ref={this.video} aria-label="Route video" playsInline controls preload="auto"
          muted={isMuted || hidden} className="w-full h-full"
          onLoadedMetadata={this.metadata} onCanPlay={this.ready} onPlaying={this.playing}
          onWaiting={this.loading} onSeeking={this.loading} onSeeked={() => { this.applySeek(); this.ready(); }} onTimeUpdate={() => {
            if (!this.state.error && (this.timeout || this.state.loading) && this.video.current.readyState >= 3) this.ready();
            else this.publish();
          }}
          onPlay={() => { if (!this.props.isPlaying) dispatch(play(this.video.current.playbackRate)); }}
          onPause={() => { cancelAnimationFrame(this.frame); this.publish(); if (this.mounted && !this.video.current.ended && this.video.current.readyState > 0 && this.pendingSeek === null) dispatch(pause()); }}
          onVolumeChange={() => { if (!hidden) this.props.onMuteChange?.(this.video.current.muted); }}
          onRateChange={() => dispatch(setPlaySpeed(this.video.current.playbackRate))}
          onEnded={this.ended}
          onError={() => {
            // HLS owns MSE errors and may still be recovering the media source.
            if (!this.hls && this.video.current.error?.code !== 1) {
              this.fail(this.video.current.error?.code === 2
                ? 'Unable to load video. Check your connection and retry.'
                : 'Unable to load video. Please retry.');
            }
          }} />
        {(error || loading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#16181AAA] pointer-events-none">
            {error ? <div role="alert" className="text-center pointer-events-auto">
              <ErrorOutline className="mb-2" /><Typography>{error}</Typography>
              {!unavailable && <Button onClick={this.retry} style={{ color: Colors.white }}>{needsGesture ? 'Play' : 'Retry'}</Button>}
            </div> : <CircularProgress aria-label="Loading video" style={{ color: Colors.white }} thickness={4} size={50} />}
          </div>
        )}
      </div>
    );
  }
}

export function DriveVideo(props) {
  const route = props.currentRoute;
  if (!route) return null;
  const src = api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
  return src ? <Playback key={`${route.fullname}:${src}`} {...props} src={src} /> : null;
}

export default connect((state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekOffset: state.seekOffset,
  seekRevision: state.seekRevision,
  isPlaying: state.isPlaying,
  currentRoute: state.currentRoute,
  loop: state.loop,
}))(DriveVideo);
