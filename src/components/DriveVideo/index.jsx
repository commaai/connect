import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { bindMedia, mediaTime } from '../../timeline/media';
import { bufferVideo, pause, play } from '../../timeline/playback';

// ReactPlayer supplies the native/HLS source loader. This controller owns the
// element's transport; no second clock or corrective playback rates exist.
export class DriveVideo extends Component {
  videoPlayer = React.createRef();
  state = { error: null, blocked: false, attempt: 0 };
  element = null;
  pendingSeek = null;
  playPending = false;
  playRequest = 0;
  recoveries = { networkError: 0, mediaError: 0 };

  componentDidMount() {
    this.mounted = true;
    this.playback = this.props.playback;
    this.props.onAudioStatusChange?.(false);
    this.unbind = this.props.dispatch(bindMedia({
      route: this.playback.currentRoute.fullname,
      sync: this.sync,
      sample: this.sample,
    }));
  }

  componentDidUpdate(prevProps) {
    const state = this.props.playback;
    const previous = prevProps.playback;
    this.playback = state;
    if (state.currentRoute.videoStartOffset !== previous.currentRoute.videoStartOffset
      || state.loop !== previous.loop) {
      this.sync(state, true);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.detach();
    this.unbind?.();
  }

  detach = () => {
    cancelAnimationFrame(this.frame);
    this.listeners?.forEach(([name, listener]) => this.element?.removeEventListener(name, listener));
    this.hls?.off('hlsBufferCodecs', this.onCodecs);
    this.element = null;
    this.hls = null;
    this.playPending = false;
    this.playRequest += 1;
  };

  bounds = () => {
    const { currentRoute, loop } = this.playback;
    const videoOffset = currentRoute.videoStartOffset || 0;
    const duration = Number.isFinite(this.element?.duration) ? this.element.duration : Infinity;
    const start = Math.max(0, ((loop?.startTime ?? 0) - videoOffset) / 1000);
    const end = Math.min(duration, ((loop ? loop.startTime + loop.duration : currentRoute.duration) - videoOffset) / 1000);
    return { start, end, videoOffset };
  };

  sync = (state, shouldSeek) => {
    this.playback = state;
    const video = this.element;
    if (!video || !this.mounted) return;
    if (shouldSeek) {
      const { start, end, videoOffset } = this.bounds();
      const target = Math.max(start, Math.min(end, ((state.offset ?? state.loop?.startTime ?? 0) - videoOffset) / 1000));
      this.pendingSeek = Number.isFinite(target) ? target : start;
      this.seekPending();
    }
    // Pausing is a transport operation, never playbackRate = 0. In particular,
    // buffering must not pause native HLS, which needs to load while paused too.
    if (!state.desiredPlaySpeed) {
      this.playRequest += 1;
      this.playPending = false;
      video.pause();
    } else if (!this.state.error && !this.state.blocked) {
      this.resumeSpeed = state.desiredPlaySpeed;
      video.playbackRate = Math.min(8, Math.max(0.1, state.desiredPlaySpeed));
      if (video.paused && !this.playPending) {
        this.playPending = true;
        const element = video;
        this.playRequest += 1;
        const request = this.playRequest;
        Promise.resolve(video.play()).catch(error => {
          if (this.mounted && this.element === element && this.playRequest === request) this.onError(error);
        }).finally(() => {
          if (this.element === element && this.playRequest === request) this.playPending = false;
        });
      }
    }
  };

  seekPending = () => {
    if (this.pendingSeek === null || !this.element || this.element.readyState < 1) return;
    const target = this.pendingSeek;
    if (Math.abs(this.element.currentTime - target) >= 0.01) this.element.currentTime = target;
    if (Math.abs(this.element.currentTime - target) < 0.05 && !this.element.seeking) {
      this.pendingSeek = null;
      this.sample();
    }
  };

  sample = (force = true) => {
    if (!force && performance.now() - (this.lastSample || 0) < 50) return;
    this.lastSample = performance.now();
    const video = this.element;
    if (!video || !this.mounted || video.seeking || this.pendingSeek !== null) return;
    const { start, end, videoOffset } = this.bounds();
    let time = video.currentTime;
    if (this.playback.desiredPlaySpeed && end > start && time >= end) {
      time = start + ((time - start) % (end - start));
      video.currentTime = time;
      // A completed file must restart as well as seek back to the loop start.
      this.sync(this.playback, false);
    }
    const offset = time * 1000 + videoOffset;
    if (offset !== this.playback.offset) this.props.dispatch(mediaTime(this.playback.currentRoute.fullname, offset));
  };

  tick = () => {
    if (!this.mounted || !this.element) return;
    this.sample(false);
    this.frame = requestAnimationFrame(this.tick);
  };

  setBuffering = value => {
    if (this.mounted && value !== this.playback.isBufferingVideo) this.props.dispatch(bufferVideo(value));
  };

  onPlayable = () => {
    this.seekPending();
    this.setBuffering(this.element.readyState < 2 || this.element.seeking);
    this.detectAudio();
  };

  onSeeked = () => {
    if (this.pendingSeek !== null) {
      if (Math.abs(this.element.currentTime - this.pendingSeek) >= 0.05) {
        this.seekPending();
        return;
      }
      this.pendingSeek = null;
    }
    this.onPlayable();
    this.sample();
  };

  onPause = () => {
    this.sample();
    if (!this.element.ended && this.playback.desiredPlaySpeed && !this.state.error) {
      this.props.dispatch(pause());
    }
  };

  detectAudio = () => {
    const video = this.element;
    if (video?.audioTracks) this.props.onAudioStatusChange?.(video.audioTracks.length > 0);
    else if (video?.mozHasAudio || video?.webkitAudioDecodedByteCount > 0) this.props.onAudioStatusChange?.(true);
  };

  onCodecs = (event, data) => this.props.onAudioStatusChange?.(Boolean(data.audio));

  onReady = () => {
    if (!this.mounted) return;
    const player = this.videoPlayer.current;
    if (this.element === player.getInternalPlayer()) { this.onPlayable(); return; }
    this.detach();
    this.element = player.getInternalPlayer();
    this.hls = player.getInternalPlayer('hls');
    this.listeners = [
      ['loadedmetadata', () => { this.seekPending(); this.detectAudio(); }],
      ['canplay', this.onPlayable],
      ['playing', this.onPlayable],
      ['waiting', () => this.setBuffering(true)],
      ['seeking', () => this.setBuffering(true)],
      ['seeked', this.onSeeked],
      ['timeupdate', this.sample],
      ['ended', this.sample],
      ['pause', this.onPause],
    ];
    this.listeners.forEach(([name, listener]) => this.element.addEventListener(name, listener));
    this.hls?.on('hlsBufferCodecs', this.onCodecs);
    // Codecs may already have been announced before MANIFEST_PARSED/onReady.
    if (this.hls?.audioTracks?.length) this.props.onAudioStatusChange?.(true);
    this.sync(this.playback, true);
    this.onPlayable();
    this.frame = requestAnimationFrame(this.tick);
  };

  onError = (error, data) => {
    if (!this.mounted || error?.name === 'AbortError') return;
    if (error === 'hlsError') {
      // HLS retries transient errors itself; only unrecovered fatal errors
      // should obscure the video. One recovery per fatal category is bounded.
      if (!data?.fatal) return;
      const hls = this.videoPlayer.current?.getInternalPlayer('hls');
      if (hls && this.recoveries[data.type] === 0 && data.response?.code !== 404) {
        this.recoveries[data.type] += 1;
        this.setBuffering(true);
        if (data.type === 'networkError') { hls.startLoad(); return; }
        if (data.type === 'mediaError') { hls.recoverMediaError(); return; }
      }
    }
    if (error?.name === 'NotAllowedError') {
      this.setState({ blocked: true });
      this.props.dispatch(pause());
      this.setBuffering(false);
      return;
    }
    const missing = data?.response?.code === 404 || error?.response?.code === 404;
    this.setState({ error: missing ? 'This video has not uploaded yet or has been deleted.' : 'Unable to load video. Try again.' });
    this.setBuffering(false);
    this.element?.pause();
  };

  retry = () => {
    this.detach();
    this.recoveries = { networkError: 0, mediaError: 0 };
    this.setBuffering(true);
    this.props.onAudioStatusChange?.(false);
    this.setState(({ attempt }) => ({ attempt: attempt + 1, error: null, blocked: false }));
  };

  resume = () => {
    this.setState({ blocked: false }, () => this.props.dispatch(play(this.resumeSpeed || 1)));
  };

  render() {
    const { playback, isMuted } = this.props;
    const { error, blocked, attempt } = this.state;
    const route = playback.currentRoute;
    const src = api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        {(error || blocked || playback.isBufferingVideo) && (
          <div className="z-50 absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#16181AAA]" role="status">
            {error ? <><ErrorOutline /><Typography>{error}</Typography><Button onClick={this.retry}>Retry video</Button></>
              : blocked ? <Button onClick={this.resume}>Play video</Button>
                : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
          </div>
        )}
        <ReactPlayer
          key={`${src}:${attempt}`}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={false}
          config={{ hlsVersion: '1.4.8', hlsOptions: { maxBufferLength: 40 } }}
          onReady={() => { if (attempt === this.state.attempt) this.onReady(); }}
          onError={(...args) => { if (attempt === this.state.attempt) this.onError(...args); }}
        />
      </div>
    );
  }
}

const ConnectedVideo = connect(state => ({ playback: state }))(DriveVideo);
// A source change gets fresh listeners/recovery state; late callbacks cannot
// alter a different drive, including refreshed signed share credentials.
export default connect(state => ({ route: state.currentRoute }))(({ route, ...props }) => route && (
  <ConnectedVideo key={`${route.fullname}:${route.share_exp}:${route.share_sig}`} {...props} />
));
