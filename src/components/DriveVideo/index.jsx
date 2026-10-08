import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { registerPlaybackClock } from '../../timeline';
import { pause, play, videoProgress } from '../../timeline/playback';

const MISSING_VIDEO = 'This video segment has not uploaded yet or has been deleted.';
const LOAD_FAILED = 'Unable to load video';
const NETWORK_FAILED = 'Unable to load video. Check network connection.';
const HLS_TYPE = 'application/vnd.apple.mpegurl';
const MAX_RECOVERIES = 2;
const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;

// hls.js loads on demand so iOS, which plays HLS natively, never downloads it.
let Hls;
let hlsImport;
const loadHls = () => {
  hlsImport ??= import('hls.js').then(
    (mod) => { Hls = mod.default; return Hls; },
    (err) => { hlsImport = null; throw err; },
  );
  return hlsImport;
};

// iPadOS reports a desktop Mac user agent; touch support tells them apart.
const isAppleMobile = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const videoStart = (route) => route?.videoStartOffset || 0;
const toMediaTime = (offset, route) => Math.max(0, (offset - videoStart(route)) / 1000);

const sourceFor = (route) => {
  if (!route) return { key: null, src: null };
  const src = api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig);
  // Demo routes can share one stream URL, so the route name is part of the identity.
  return { key: `${route.fullname} ${src}`, src };
};

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button className="!mt-2" onClick={onRetry}>Retry</Button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

/**
 * The <video> element is the playback clock. Redux holds the requested state
 * (speed, explicit seeks by seekId) plus snapshots of the observed position.
 */
class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.videoRef = React.createRef();
    this.state = { error: null, buffering: false };
    this.session = null; // listeners and hls.js instance of the attached source
    this.seekId = undefined; // latest explicit seek taken from the store
    this.pending = null; // route offset to seek to once metadata is available
    this.unanchoredSeek = null; // explicit seek target taken before the route's video start was known
    this.speed = props.desiredPlaySpeed || 1;
    this.hasAudio = false;
    this.readOffset = this.readOffset.bind(this);
    this.retry = () => this.load(this.position());
  }

  componentDidMount() {
    const video = this.videoRef.current;
    // Controls call these inside the click so iOS treats play and unmute as user initiated.
    this.unregisterClock = registerPlaybackClock(this.readOffset, {
      play: (speed) => { this.speed = speed; this.startPlayback(speed); },
      setMuted: (muted) => { video.muted = muted; },
    });
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    const { isMuted, desiredPlaySpeed, seekId, offset, loop, currentRoute } = this.props;
    if (isMuted !== prevProps.isMuted) this.videoRef.current.muted = isMuted;
    if (desiredPlaySpeed > 0) this.speed = desiredPlaySpeed;
    // Attaching a source syncs playback itself; otherwise only a new command does, never progress.
    if (!this.syncSource()) {
      if (seekId !== this.seekId) {
        this.seekId = seekId;
        this.pending = offset ?? 0;
        this.unanchoredSeek = currentRoute?.videoStartOffset == null ? this.pending : null;
        this.applyPending();
      }
      if (desiredPlaySpeed !== prevProps.desiredPlaySpeed) this.syncPlayback();
    }
    // A seek applied before the video start was known assumed it was 0. When it arrives, repeat the
    // seek once if it targeted the range start (or a time before the first frame) so a deep-linked
    // clip still begins at its start. Other positions and whole-route playback are not moved.
    const videoStartOffset = currentRoute?.videoStartOffset;
    if (this.unanchoredSeek !== null && videoStartOffset != null) {
      const target = this.unanchoredSeek;
      this.unanchoredSeek = null;
      if (videoStartOffset > 0 && target > 0 && target <= loop?.startTime && this.pending === null) {
        this.pending = target;
        this.applyPending();
      }
    }
    this.updateBuffering();
  }

  componentWillUnmount() {
    this.unregisterClock();
    this.release();
    this.sourceKey = undefined;
    this.videoRef.current?.removeAttribute('src');
    this.videoRef.current?.load();
  }

  /** Route offset shown by the video, or undefined while a seek or source is still pending. */
  readOffset(state) {
    const video = this.videoRef.current;
    if (!this.session || !video || this.pending !== null || state.seekId !== this.seekId
      || state.currentRoute?.fullname !== this.session.fullname || video.readyState < HAVE_METADATA) {
      return undefined;
    }
    return video.currentTime * 1000 + videoStart(state.currentRoute);
  }

  position() {
    const { seekId, offset } = this.props;
    if (seekId === this.seekId) return this.readOffset(this.props) ?? this.pending ?? offset ?? 0;
    return offset ?? 0;
  }

  withStore(fn) {
    this.props.dispatch((dispatch, getState) => fn(getState(), dispatch));
  }

  syncSource() {
    const { currentRoute, offset } = this.props;
    if (sourceFor(currentRoute).key === this.sourceKey) return false;
    const sameRoute = currentRoute && currentRoute.fullname === this.sourceRoute;
    // A refreshed URL for the same route (e.g. new share signature) keeps the viewer's place.
    this.load(sameRoute ? this.position() : offset);
    if (!sameRoute) this.unanchoredSeek = currentRoute?.videoStartOffset == null ? this.pending : null;
    return true;
  }

  load(target) {
    const video = this.videoRef.current;
    const { currentRoute: route, seekId } = this.props;
    const { key, src } = sourceFor(route);
    this.release();
    if (route?.fullname !== this.sourceRoute) this.setAudio(false);
    this.sourceKey = key;
    this.sourceRoute = route?.fullname;
    this.seekId = seekId;
    this.pending = target ?? 0;
    if (this.state.error) this.setState({ error: null });
    if (!route) {
      video.removeAttribute('src');
      video.load();
      return;
    }

    const session = { fullname: route.fullname, decodeRecoveries: 0, resets: 0, offs: [] };
    this.session = session;
    const on = (type, fn, eventTarget = video) => {
      eventTarget.addEventListener(type, fn);
      session.offs.push(() => eventTarget.removeEventListener(type, fn));
    };
    // timeupdate is too coarse for loop ends at 8x, so check every frame while playing.
    const tick = () => {
      session.raf = 0;
      if (this.session === session && !video.paused) {
        this.checkLoop();
        session.raf = requestAnimationFrame(tick);
      }
    };

    // Native HLS can list the audio track only after metadata (iOS Safari: by canplay).
    const checkAudio = () => {
      if (!session.hls && video.audioTracks) this.setAudio(video.audioTracks.length > 0);
    };
    for (const type of ['loadedmetadata', 'loadeddata', 'canplay', 'playing']) on(type, checkAudio);
    if (video.audioTracks?.addEventListener) {
      for (const type of ['addtrack', 'removetrack', 'change']) on(type, checkAudio, video.audioTracks);
    }
    // A media source reset pauses the element without a pause event, so reapply the requested state.
    on('loadedmetadata', () => { this.applyPending(); this.syncPlayback(); });
    on('timeupdate', () => { this.checkLoop(); this.report(); });
    on('seeked', () => this.report());
    on('playing', () => { session.raf ||= requestAnimationFrame(tick); });
    // Lock screen, headset and system controls drive the element directly.
    on('play', () => this.withStore((state, dispatch) => {
      if (!video.paused && state.desiredPlaySpeed === 0) dispatch(play(this.speed));
    }));
    on('pause', () => {
      this.report();
      this.withStore((state, dispatch) => {
        // Reaching the end pauses too; 'ended' decides whether to loop or stop. Before metadata a
        // pause may come from a source reset, so an interruption there is left to the play request.
        if (video.paused && !video.ended && video.readyState >= HAVE_METADATA && state.desiredPlaySpeed > 0) {
          dispatch(pause());
        }
      });
    });
    // Only a loop the media actually reaches repeats (the media may end before the logs do).
    on('ended', () => this.withStore(({ desiredPlaySpeed, loop, currentRoute }, dispatch) => {
      if (!(desiredPlaySpeed > 0)) return;
      if (loop?.duration > 0 && !(toMediaTime(loop.startTime, currentRoute) >= video.duration)) {
        this.startPlayback(desiredPlaySpeed);
      } else {
        dispatch(pause());
      }
    }));
    // The app keeps defaultPlaybackRate at the rate it applied, so any other rate came from the browser.
    on('ratechange', () => this.withStore((state, dispatch) => {
      const rate = video.playbackRate;
      if (rate > 0 && rate !== video.defaultPlaybackRate && state.desiredPlaySpeed > 0) dispatch(play(rate));
    }));
    on('error', () => {
      const code = video.error?.code;
      if (code === 1) return; // MEDIA_ERR_ABORTED
      // The browser has already retried network errors; only an hls.js decode error is recovered here.
      if (code === 3 && session.hls) this.recoverDecode(session);
      else this.fail(code === 2 ? NETWORK_FAILED : LOAD_FAILED);
    });
    for (const type of ['loadeddata', 'canplay', 'waiting', 'playing', 'seeking', 'seeked', 'play', 'pause', 'emptied']) {
      on(type, () => this.updateBuffering());
    }

    const attach = (HlsClass) => {
      if (this.session !== session) return;
      if (HlsClass?.isSupported()) {
        const hls = new HlsClass({ maxBufferLength: 40, startPosition: toMediaTime(this.pending ?? 0, route) });
        session.hls = hls;
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          // hls.js retries errors itself and reports them fatal only once its retries are exhausted.
          if (!data.fatal || this.session !== session) return;
          if (data.response?.code === 404) this.fail(MISSING_VIDEO);
          else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) this.recoverDecode(session);
          else this.fail(data.type === HlsClass.ErrorTypes.NETWORK_ERROR ? NETWORK_FAILED : LOAD_FAILED);
        });
        // hls.js also resets the media source on its own to recover some media errors.
        hls.on(HlsClass.Events.MEDIA_DETACHING, () => { session.resets += 1; });
        hls.on(HlsClass.Events.BUFFER_CODECS, (_event, data) => {
          if (this.session === session) this.setAudio(Boolean(data.audio || data.audiovideo));
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (!HlsClass || video.canPlayType(HLS_TYPE)) {
        video.src = src;
      } else {
        this.fail(LOAD_FAILED);
        return;
      }
      session.attached = true;
      this.syncPlayback();
    };
    if (!/\.m3u8(\?|$)/i.test(src) || (isAppleMobile() && video.canPlayType(HLS_TYPE))) attach(null);
    else if (Hls) attach(Hls);
    else loadHls().then(attach, () => this.session === session && this.fail(LOAD_FAILED));
  }

  release() {
    const { session } = this;
    if (!session) return;
    this.session = null;
    session.offs.forEach((off) => off());
    cancelAnimationFrame(session.raf);
    session.hls?.destroy();
  }

  /** Reattaches a fresh media source in place, a bounded number of times per source. */
  recoverDecode(session) {
    if (session.decodeRecoveries >= MAX_RECOVERIES) {
      this.fail(LOAD_FAILED);
      return;
    }
    session.decodeRecoveries += 1;
    this.pending = this.position();
    session.hls.recoverMediaError();
  }

  fail(error) {
    this.report();
    this.release();
    this.setState({ error });
    this.updateBuffering();
  }

  applyPending() {
    const video = this.videoRef.current;
    if (this.pending === null || !this.session || video.readyState < HAVE_METADATA) return;
    const time = toMediaTime(this.pending, this.props.currentRoute);
    this.pending = null;
    if (Math.abs(video.currentTime - time) > 0.01) video.currentTime = time;
  }

  applyRate(speed) {
    const video = this.videoRef.current;
    const rate = Math.min(16, Math.max(0.0625, speed)); // browsers reject rates outside 1/16x–16x
    video.defaultPlaybackRate = rate;
    if (video.playbackRate !== rate) video.playbackRate = rate;
  }

  startPlayback(speed) {
    const video = this.videoRef.current;
    const { session } = this;
    const { loop, currentRoute } = this.props;
    if (!session) return;
    // An empty selection (e.g. entirely before the first video frame) has nothing to play.
    if (loop && !(loop.duration > 0)) {
      video.pause();
      this.props.dispatch(pause());
      return;
    }
    // play() before the source is attached would be aborted by the attach itself.
    if (!session.attached) return;
    this.applyRate(speed);
    if (!video.paused) return;
    if (video.ended || this.readOffset(this.props) >= (loop ? loop.startTime + loop.duration : Infinity)) {
      video.currentTime = toMediaTime(loop?.startTime ?? 0, currentRoute);
    }
    const { resets } = session;
    video.play()?.catch((err) => {
      // Denied autoplay, or an interruption before playback began (AbortError), leaves the video
      // paused, so the controls follow. A source reset aborts the request too; it replaces the
      // session or counts a reset, and playback resumes once the new source has metadata.
      if (this.session !== session || session.resets !== resets || !video.paused) return;
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') this.props.dispatch(pause());
    });
  }

  syncPlayback() {
    const video = this.videoRef.current;
    if (!this.session) return;
    if (this.props.desiredPlaySpeed > 0) this.startPlayback(this.props.desiredPlaySpeed);
    else if (!video.paused) video.pause();
  }

  checkLoop() {
    const video = this.videoRef.current;
    const { loop, currentRoute } = this.props;
    if (video.paused || !loop || !(this.readOffset(this.props) >= loop.startTime + loop.duration)) return;
    if (loop.duration > 0) video.currentTime = toMediaTime(loop.startTime, currentRoute);
    else this.props.dispatch(pause()); // the selection became empty while playing
  }

  report() {
    const fullname = this.session?.fullname;
    // Checked against the store, so progress never overwrites a seek React has not delivered yet.
    this.withStore((state, dispatch) => {
      const offset = this.readOffset(state);
      if (Number.isFinite(offset) && offset !== state.offset) dispatch(videoProgress(offset, fullname));
    });
  }

  updateBuffering() {
    const video = this.videoRef.current;
    // While paused, only an in-flight seek is worth a spinner.
    const buffering = Boolean(this.session)
      && (this.props.desiredPlaySpeed > 0 ? video.readyState < HAVE_FUTURE_DATA : video.seeking);
    this.setState((state) => (state.buffering === buffering ? null : { buffering }));
  }

  setAudio(hasAudio) {
    if (hasAudio === this.hasAudio) return;
    this.hasAudio = hasAudio;
    this.props.onAudioStatusChange?.(hasAudio);
  }

  render() {
    const { error, buffering } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] isolate">
        <VideoOverlay loading={buffering} error={error} onRetry={this.retry} />
        <video ref={this.videoRef} playsInline preload="auto" style={{ width: '100%', height: '100%' }} />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekId: state.seekId,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
