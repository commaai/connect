import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';
import { Button, CircularProgress, IconButton } from '@material-ui/core';

import { api } from '../../api/backend';
import { ErrorOutline, Forward10, Pause, PlayArrow, Replay10 } from '../../icons';
import { currentOffset, setVideoClock } from '../../timeline';
import { pause, play, videoProgress } from '../../timeline/playback';

const unavailable = 'This video has not uploaded yet or has been deleted.';
const unplayable = 'This video is unavailable or cannot be played by this browser.';
const connectionError = 'Unable to load video. Check your connection and try again.';
const emptySelection = 'There is no video in this selection. Choose another part of the drive.';
const playbackSpeeds = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8];

export class RouteVideo extends Component {
  video = React.createRef();
  state = { loading: true, error: null, needsPlay: false, position: 0, playbackRate: 1 };
  playRequest = 0;
  sourceRequest = 0;
  pendingSeek = this.props.offset ?? this.props.loop?.startTime ?? 0;

  componentDidMount() {
    this.clearClock = setVideoClock(() => this.video.current?.readyState && this.pendingSeek === null
      ? this.routeOffset : null);
    this.loadSource();
    document.addEventListener('visibilitychange', this.onProgress);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.seekRevision !== this.props.seekRevision) {
      this.seekTo(this.props.offset ?? this.props.loop?.startTime ?? 0);
    }
    if (prevProps.currentRoute.videoStartOffset !== this.props.currentRoute.videoStartOffset && this.video.current.readyState) {
      this.seekTo(this.routeOffset);
    }
    if (prevProps.desiredPlaySpeed !== this.props.desiredPlaySpeed) this.applyPlayback();
  }

  componentWillUnmount() {
    this.playRequest += 1;
    this.sourceRequest += 1;
    clearTimeout(this.loadTimeout);
    document.removeEventListener('visibilitychange', this.onProgress);
    cancelAnimationFrame(this.frame);
    this.clearClock();
    const hls = this.hls;
    this.hls = null;
    hls?.destroy();
    this.video.current.removeAttribute('src');
    this.video.current.load();
  }

  get videoStart() {
    return this.props.currentRoute.videoStartOffset || 0;
  }

  get routeOffset() {
    return this.video.current.currentTime * 1000 + this.videoStart;
  }

  get isHls() {
    return /\.m3u8(?:[?#]|$)/i.test(this.props.src);
  }

  get range() {
    const { currentRoute, loop } = this.props;
    const duration = this.video.current.duration;
    const start = Math.max(0, ((loop?.startTime ?? 0) - this.videoStart) / 1000);
    const end = Math.min(Number.isFinite(duration) ? duration : Infinity,
      ((loop ? loop.startTime + loop.duration : currentRoute.duration) - this.videoStart) / 1000);
    return { start, end };
  }

  loadSource = async (forceHls = false) => {
    const video = this.video.current;
    this.sourceRequest += 1;
    const request = this.sourceRequest;
    this.playRequest += 1;
    this.ignoreSourcePause = !video.paused; // load()/detach may pause the previous source.
    const previousHls = this.hls;
    this.hls = null;
    previousHls?.destroy();
    this.recovered = false;
    this.recovering = false;
    this.loadingSource = true;
    this.usingHls = this.isHls && (forceHls || !video.canPlayType('application/vnd.apple.mpegurl'));
    this.setState({ error: null, needsPlay: false });
    this.setLoading(true);
    // MP4 and native HLS use only the browser's media stack, including in PWAs.
    if (!this.usingHls) {
      video.src = this.props.src;
      video.load();
      return;
    }
    try {
      const { default: Hls } = await import('hls.js');
      if (request !== this.sourceRequest) return;
      if (!Hls.isSupported()) {
        this.fail(forceHls ? unplayable : 'This browser cannot play this video. Try an updated browser.');
        return;
      }
      const hls = new Hls({ maxBufferLength: 30, autoStartLoad: false });
      this.hls = hls;
      video.removeAttribute('src');
      video.load();
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.hls === hls) hls.startLoad(Math.max(0, ((this.pendingSeek ?? this.routeOffset) - this.videoStart) / 1000));
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (this.hls !== hls || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recovered) {
          this.recovered = true;
          this.recovering = true;
          this.pendingSeek = this.pendingSeek ?? this.routeOffset;
          hls.recoverMediaError();
          return;
        }
        const status = data.response?.code;
        if (status === 404 || status === 410) this.fail(unavailable);
        else if (status === 401 || status === 403) this.fail('Access to this video has expired. Reopen the shared route.');
        else this.fail(connectionError);
      });
      hls.loadSource(this.props.src);
      hls.attachMedia(video);
    } catch {
      if (request === this.sourceRequest) this.fail('Unable to load the video player. Check your connection and try again.');
    }
  };

  fail = (error) => {
    this.playRequest += 1;
    this.sourceRequest += 1;
    clearTimeout(this.loadTimeout);
    this.hls?.stopLoad();
    this.video.current.pause();
    this.props.dispatch(pause());
    this.setState({ loading: false, error, needsPlay: false });
  };

  startPlayback = () => {
    if (this.usingHls && !this.hls) return;
    const video = this.video.current;
    this.playRequest += 1;
    const request = this.playRequest;
    video.play()?.catch((error) => {
      if (request !== this.playRequest || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        this.props.dispatch(pause());
        this.setLoading(false);
        this.setState({ needsPlay: true });
      } else {
        this.fail('Unable to play video. Please try again.');
      }
    });
  };

  applyPlayback = () => {
    const video = this.video.current;
    const speed = this.props.desiredPlaySpeed;
    if (!speed) {
      this.playRequest += 1;
      video.pause();
    } else if (!this.state.error) {
      video.playbackRate = speed;
      if (video.paused) this.startPlayback();
    }
  };

  seekTo = (offset) => {
    const video = this.video.current;
    this.pendingSeek = offset;
    if (this.state.error && this.state.error !== emptySelection) return false;
    if (!video.readyState) {
      if (this.hls?.loadingEnabled) this.hls.startLoad(Math.max(0, (offset - this.videoStart) / 1000));
      return false;
    }
    const { start, end } = this.range;
    video.loop = Boolean(this.props.loop && start === 0 && end === video.duration);
    if (end <= start) {
      this.fail(emptySelection);
      return false;
    }
    const time = Math.max(start, Math.min(end, (offset - this.videoStart) / 1000));
    if (Math.abs(video.currentTime - time) > 0.001) video.currentTime = time;
    this.pendingSeek = null;
    if (this.state.error) {
      this.hls?.startLoad(video.currentTime);
      this.setState({ error: null }, this.applyPlayback);
    }
    this.reportProgress();
    return true;
  };

  onMetadata = () => {
    this.ignoreSourcePause = false;
    this.loadingSource = false;
    this.recovering = false;
    if (!this.props.desiredPlaySpeed) this.video.current.playbackRate = this.state.playbackRate;
    if (this.seekTo(this.pendingSeek ?? this.routeOffset)) this.applyPlayback();
  };

  reportProgress = () => {
    const video = this.video.current;
    if (!video.readyState || this.pendingSeek !== null) return;
    const offset = this.routeOffset;
    this.props.dispatch(videoProgress(offset));
    this.setState({ position: offset });
  };

  enforceLoop = () => {
    const video = this.video.current;
    if (video.readyState && !video.paused && !video.seeking && !video.loop && this.props.loop && !this.state.error) {
      const { start, end } = this.range;
      if (end > start && (video.currentTime >= end || video.currentTime < start)) {
        this.seekTo(start * 1000 + this.videoStart);
      }
    }
  };

  checkLoop = () => {
    this.enforceLoop();
    if (!this.video.current.paused) this.frame = requestAnimationFrame(this.checkLoop);
  };

  onEnded = () => {
    if (this.props.loop && this.props.desiredPlaySpeed && this.range.end > this.range.start) {
      this.seekTo(this.range.start * 1000 + this.videoStart);
      this.startPlayback();
    } else {
      this.reportProgress();
      this.props.dispatch(pause());
    }
  };

  onPause = () => {
    cancelAnimationFrame(this.frame);
    if (this.ignoreSourcePause) {
      this.ignoreSourcePause = false;
      return;
    }
    if (this.recovering || this.video.current.ended) return;
    this.reportProgress();
    this.props.dispatch(pause());
    this.setLoading(false);
  };

  onPlay = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.checkLoop);
    this.props.dispatch(play(this.video.current.playbackRate));
    this.setState({ needsPlay: false, playbackRate: this.video.current.playbackRate });
  };

  onRateChange = () => {
    if (this.loadingSource || this.recovering) return;
    if (this.video.current.paused) this.setState({ playbackRate: this.video.current.playbackRate });
    else this.onPlay();
  };

  changePlaybackRate = (event) => {
    const playbackRate = Number(event.target.value);
    this.video.current.playbackRate = playbackRate;
    this.setState({ playbackRate });
    if (this.props.desiredPlaySpeed) this.props.dispatch(play(playbackRate));
  };

  onError = () => {
    if (this.usingHls) return; // HLS recovery and errors are handled above.
    const code = this.video.current.error?.code;
    if (code === 1) return;
    // Some browsers advertise native HLS but reject our transport streams.
    if (code === 4 && this.isHls) {
      this.pendingSeek = this.pendingSeek ?? this.routeOffset;
      this.loadSource(true);
      return;
    }
    if (code === 3) this.fail('This video could not be decoded. Please try again.');
    else if (code === 4) this.fail(unplayable);
    else this.fail(connectionError);
  };

  setLoading = (loading) => {
    clearTimeout(this.loadTimeout);
    this.setState({ loading });
    if (loading) {
      const fragment = this.hls?.inFlightFragments.main?.frag;
      const loaded = fragment?.stats.loaded;
      this.loadTimeout = setTimeout(() => {
        const current = this.hls?.inFlightFragments.main?.frag;
        if (document.hidden || (current && (current !== fragment || current.stats.loaded > loaded))) this.setLoading(true);
        else if (!this.state.error) this.fail('Video is taking too long to load. Check your connection and try again.');
      }, 20000);
    }
  };

  onProgress = () => {
    if (this.state.loading) this.setLoading(true);
  };

  onSeeked = () => {
    const { start, end } = this.range;
    const time = this.video.current.currentTime;
    if (end > start && (time < start || time > end)) this.seekTo(time * 1000 + this.videoStart);
    this.reportProgress();
    this.setLoading(false);
  };

  retry = () => {
    const speed = this.video.current.playbackRate;
    this.pendingSeek = this.pendingSeek ?? this.routeOffset;
    this.loadSource();
    this.video.current.playbackRate = speed;
    this.props.dispatch(play(speed));
    if (!this.usingHls) this.startPlayback();
  };

  renderStatus() {
    const { error, needsPlay } = this.state;
    if (error) {
      return (
        <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-sm text-white">
          <ErrorOutline />
          <p>{error}</p>
          <Button variant="outlined" onClick={this.retry}>Try again</Button>
        </div>
      );
    }
    if (needsPlay) {
      return (
        <Button variant="contained" onClick={this.startPlayback} aria-label="Play video">
          <PlayArrow /> Play video
        </Button>
      );
    }
    return <CircularProgress aria-label="Loading video" size={32} style={{ color: 'white' }} />;
  }

  render() {
    const { currentRoute, mapView, desiredPlaySpeed } = this.props;
    const { loading, error, needsPlay, position, playbackRate } = this.state;
    const interactive = Boolean(error || needsPlay);
    const timestamp = dayjs(currentRoute.start_time_utc_millis + position).format('HH:mm:ss');
    return (
      <div className="mx-auto w-full max-w-[964px] overflow-hidden rounded-xl border border-white/10 bg-[#101416] shadow-lg">
        <div className={mapView ? 'hidden' : 'relative aspect-[1.593]'}>
          <video
            ref={this.video}
            aria-label="Drive video"
            className="h-full w-full object-contain"
            controls
            playsInline
            muted
            preload="auto"
            onLoadedMetadata={this.onMetadata}
            onProgress={this.onProgress}
            onTimeUpdate={() => { this.enforceLoop(); this.reportProgress(); }}
            onSeeked={this.onSeeked}
            onWaiting={() => this.setLoading(true)}
            onSeeking={() => this.setLoading(true)}
            onCanPlay={() => this.setLoading(false)}
            onPlaying={() => this.setLoading(false)}
            onPlay={this.onPlay}
            onPause={this.onPause}
            onEnded={this.onEnded}
            onRateChange={this.onRateChange}
            onError={this.onError}
          />
          {(loading || interactive) && (
            <div className={`absolute inset-0 bottom-12 flex items-center justify-center p-6 text-center ${interactive ? 'bg-black/60' : 'pointer-events-none'}`}>
              {this.renderStatus()}
            </div>
          )}
        </div>
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 text-xs text-white/70">
          <span className="tabular-nums" aria-label="Drive time">{timestamp}</span>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Jump back 10 seconds" onClick={() => this.seekTo(currentOffset() - 10000)}>
              <Replay10 />
            </IconButton>
            <IconButton aria-label="Jump forward 10 seconds" onClick={() => this.seekTo(currentOffset() + 10000)}>
              <Forward10 />
            </IconButton>
            <select
              aria-label="Playback speed"
              className="rounded-md bg-[#202629] p-2 text-white"
              value={playbackRate}
              onChange={this.changePlaybackRate}
            >
              {playbackSpeeds.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
            </select>
            {mapView && (
              <IconButton
                aria-label={desiredPlaySpeed ? 'Pause' : 'Play video'}
                onClick={() => desiredPlaySpeed ? this.props.dispatch(pause()) : this.startPlayback()}
              >
                {desiredPlaySpeed ? <Pause /> : <PlayArrow />}
              </IconButton>
            )}
          </div>
        </div>
        {mapView && error && (
          <div role="alert" className="px-4 pb-3 text-sm">
            {error} <Button onClick={this.retry}>Try again</Button>
          </div>
        )}
      </div>
    );
  }
}

const DriveVideo = (props) => {
  if (!props.currentRoute) return null;
  const route = props.currentRoute;
  const src = api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
  return <RouteVideo key={`${route.fullname}:${src}`} {...props} src={src} />;
};

export default connect((state) => ({
  currentRoute: state.currentRoute,
  offset: state.offset,
  seekRevision: state.seekRevision,
  desiredPlaySpeed: state.desiredPlaySpeed,
  loop: state.loop,
}))(DriveVideo);
