import React, { Component } from 'react';
import { connect } from 'react-redux';

import { api } from '../../api/backend';
import { ErrorOutline } from '../../icons';
import { currentOffset, holdVideo, setVideo, videoReady } from '../../timeline';
import { pause, play, seek, setMaxPlaySpeed } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const ROUTE_NOT_UPLOADED = 'Video for this drive has not uploaded yet or has been deleted.';
const NETWORK = 'Unable to load video. Check your network connection.';
const UNPLAYABLE = 'Unable to load video.';

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.video = React.createRef();
    this.lastMediaRecovery = 0;

    this.load = this.load.bind(this);
    this.onError = this.onError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onLoadedData = this.onLoadedData.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.togglePlay = this.togglePlay.bind(this);

    this.state = { error: null };
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, desiredPlaySpeed, offset } = this.props;
    const { error } = this.state;
    // Play after an error, or a seek into another segment after a missing one, tries again
    const movedAfterError = error === NOT_UPLOADED
      && getSegmentNumber(currentRoute, offset) !== getSegmentNumber(currentRoute, this.failedAt);
    const playedAfterError = error && desiredPlaySpeed && !prevProps.desiredPlaySpeed;
    if (movedAfterError || playedAfterError) {
      this.load();
    }
  }

  // A reset on the page paints the player black (iOS) or white (Android, from hls.js destroy()), so
  // only stop loading now and reset the video once it is off the page.
  componentWillUnmount() {
    const { hls } = this;
    const video = this.video.current;
    setVideo(null);
    this.loading = null;
    this.hls = null;
    // a MediaSource opening late must not start loading again
    if (hls) hls.config.autoStartLoad = false;
    hls?.stopLoad();
    setTimeout(() => { hls?.destroy(); video.removeAttribute('src'); video.load(); }, 1000);
  }

  // Play the current route from the current playback offset.
  async load() {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.video.current;
    this.unload();
    onAudioStatusChange?.(false);
    this.setState({ buffering: true, error: null });

    this.src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // Safari 17+ (macOS, iPadOS, iOS) plays HLS natively, keeping AirPlay and the system audio
    // session; iPhones before iOS 17.1 have no MediaSource at all. Everything else gets hls.js.
    const native = !window.MediaSource || (window.ManagedMediaSource && video.canPlayType('application/vnd.apple.mpegurl'));
    // native HLS stalls above 2x (iOS simulator: 4x and 8x spin even on a direct playbackRate write).
    // The cap goes in before the video is attached, so the play() at the end of load() applies it.
    this.props.dispatch(setMaxPlaySpeed(native ? 2 : null));
    // attaching holds the clock at the requested time while hls.js downloads
    setVideo(video);
    const loading = this.loading = {};
    if (native) {
      video.src = this.src;
    } else {
      let Hls;
      try {
        ({ default: Hls } = await import('hls.js/light'));
      } catch {
        if (this.loading === loading) this.fail(NETWORK);
        return;
      }
      if (this.loading !== loading) return;
      // start where playback starts (deep links, seeks during the download), not at segment 0
      this.hls = new Hls({ maxBufferLength: 40, startPosition: Math.max(0, this.videoTime(currentOffset())) });
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.on(Hls.Events.BUFFER_CODECS, (_, data) => this.hls && this.props.onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.loadSource(this.src);
      this.hls.attachMedia(video);
    }
    if (this.props.desiredPlaySpeed) this.props.dispatch(play(this.props.desiredPlaySpeed));
  }

  // Stop the video and hand the clock back to Redux first (the teardown resets currentTime).
  unload() {
    const offset = setVideo(null);
    this.loading = null;
    this.hls?.destroy();
    this.hls = null;
    // a no-op on a video that never loaded or that hls.js already reset
    this.video.current.removeAttribute('src');
    this.video.current.load();
    return offset;
  }

  // Nothing plays without video: pause where it stopped, so the controls do not claim playback.
  fail(error) {
    this.failedAt = this.unload();
    this.props.dispatch(pause());
    this.setState({ buffering: false, error });
  }

  // A paused video shows its frame at once, and hls.js browsers report the paint. iOS native HLS
  // went black on drive close with that report, so there 0.3 s of playing stands in for it.
  // (Events can still reach a closed player until React detaches it: it ignores them.)
  onLoadedData() {
    if (!this.video.current) return;
    if (this.video.current.paused) this.setState({ picture: true });
    else if (this.hls) this.video.current.requestVideoFrameCallback?.(() => this.setState({ picture: true }));
  }

  onLoadedMetadata() {
    if (!this.video.current) return;
    videoReady();
    const { audioTracks } = this.video.current;
    if (!this.hls && audioTracks) this.props.onAudioStatusChange?.(audioTracks.length > 0);
  }

  onError() {
    const { error } = this.video.current || {};
    // hls.js reports its own errors; code 1 is an abort we asked for
    if (this.hls || !error || error.code === 1) return;
    // native HLS reports a missing playlist as "unsupported" (code 4): ask the server which it was
    const { loading } = this;
    const fail = (message) => this.loading === loading && this.fail(message);
    if (error.code !== 4) fail(error.code === 2 ? NETWORK : UNPLAYABLE);
    else fetch(this.src).then((resp) => fail(resp.status === 404 ? ROUTE_NOT_UPLOADED : UNPLAYABLE), () => fail(NETWORK));
  }

  onHlsError(_, data) {
    if (!data.fatal || !this.hls) return;
    if (data.type === 'mediaError' && Date.now() - this.lastMediaRecovery > 5000) {
      this.lastMediaRecovery = Date.now();
      // recovery reattaches the media, which pauses it and resets currentTime without events
      holdVideo();
      this.hls.recoverMediaError();
      if (this.props.desiredPlaySpeed) {
        this.props.dispatch(play(this.props.desiredPlaySpeed));
      }
    } else if (data.response?.code === 404) {
      this.fail(data.details === 'manifestLoadError' ? ROUTE_NOT_UPLOADED : NOT_UPLOADED);
    } else if (data.type === 'networkError' && !(data.response?.code >= 400)) {
      this.fail(NETWORK);
    } else {
      this.fail(UNPLAYABLE);
    }
  }

  // Mirror pauses and plays the browser made on its own (ended, autoplay rules, OS controls).
  onPause() {
    if (!this.video.current) return;
    if (this.video.current.readyState >= 2) this.setState({ picture: true });
    if (this.props.desiredPlaySpeed && !this.video.current.ended) {
      this.props.dispatch(pause());
    }
  }

  onPlay() {
    if (!this.props.desiredPlaySpeed) this.props.dispatch(play(this.video.current.playbackRate));
  }

  videoTime(offset) {
    return (offset - (this.props.currentRoute?.videoStartOffset || 0)) / 1000;
  }

  // A selection that starts after the video ends has no video to loop: stay paused at the end.
  onEnded() {
    const { desiredPlaySpeed, dispatch, loop } = this.props;
    const start = loop?.startTime || 0;
    if (this.videoTime(start) >= this.video.current.duration - 0.1) return dispatch(pause());
    dispatch(seek(start));
    dispatch(play(desiredPlaySpeed || 1));
  }

  // Wrap at the end of the selected range, or stop if the range ends before the video starts.
  onTimeUpdate() {
    const { dispatch, loop } = this.props;
    const video = this.video.current;
    if (!this.state.picture && !video.paused && !video.seeking && performance.now() - this.playingAt >= 300) {
      this.setState({ picture: true });
    }
    if (!loop?.duration || video.seeking) return;
    const end = this.videoTime(loop.startTime + loop.duration);
    if (video.currentTime > end || video.currentTime < this.videoTime(loop.startTime) - 1) {
      dispatch(end <= 0 ? pause() : seek(loop.startTime));
    }
  }

  togglePlay() {
    const { desiredPlaySpeed, dispatch } = this.props;
    dispatch(desiredPlaySpeed ? pause() : play(this.video.current.playbackRate || 1));
  }

  render() {
    const { desiredPlaySpeed, isMuted } = this.props;
    const { buffering, error, picture } = this.state;
    const showSpinner = (buffering || !picture) && !error && desiredPlaySpeed > 0;
    // the delay is chosen when the spinner appears, so a picture arriving under it cannot blink it
    this.spinnerDelay = showSpinner ? this.spinnerDelay ?? picture : null;

    return (
      // as wide as fits; on screens at least 700 px tall, short enough that the controls (about
      // 390 px of header, timeline and controls) stay on screen. Shorter screens scroll anyway.
      <div className="relative w-full max-w-[964px] [@media(min-height:700px)]:w-[min(100%,calc((100dvh-390px)*1.593))] m-[0_auto] aspect-[1.593] overflow-hidden rounded-lg bg-black">
        <video
          ref={this.video}
          className="w-full h-full object-contain cursor-pointer"
          playsInline
          preload="auto"
          muted={isMuted}
          onClick={this.togglePlay}
          onLoadedMetadata={this.onLoadedMetadata}
          onLoadedData={this.onLoadedData}
          onEmptied={() => { this.playingAt = NaN; this.setState({ picture: false }); }}
          onLoadStart={() => this.setState({ buffering: true })}
          onWaiting={() => this.setState({ buffering: true })}
          onSeeking={() => this.setState({ buffering: true })}
          onCanPlay={() => this.setState({ buffering: false })}
          onPlaying={() => { this.playingAt = performance.now(); this.setState({ buffering: false }); }}
          onSeeked={() => this.setState({ buffering: false })}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onEnded={this.onEnded}
          onTimeUpdate={this.onTimeUpdate}
          onError={this.onError}
        />
        {showSpinner && (
          // waits 300 ms over a picture, so quick seeks do not flash it; an empty player shows it now
          <div className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 ${this.spinnerDelay ? 'animate-[fadein_200ms_300ms_both]' : ''}`}>
            <div aria-hidden="true" className="size-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        <div role="status" className="sr-only">{showSpinner ? 'Loading video' : ''}</div>
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center text-white">
            <ErrorOutline />
            <p role="alert" className="text-sm max-w-xs">{error}</p>
            <button
              type="button"
              className="min-h-11 rounded-full border border-white/30 px-5 text-sm hover:bg-white/10"
              onClick={this.togglePlay}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  loop: state.loop,
  offset: state.offset,
});

export default connect(stateToProps)(DriveVideo);
