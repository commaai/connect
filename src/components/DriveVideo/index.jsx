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
    this.hls = null;
    this.lastMediaRecovery = 0;

    this.load = this.load.bind(this);
    this.onError = this.onError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.togglePlay = this.togglePlay.bind(this);

    this.state = {
      buffering: true,
      error: null,
    };
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, offset } = this.props;
    // a missing segment: seeking to another segment tries again from there
    const movedAfterError = this.state.error === NOT_UPLOADED
      && getSegmentNumber(currentRoute, offset) !== getSegmentNumber(currentRoute, this.failedAt);
    if ((currentRoute && prevProps.currentRoute?.fullname !== currentRoute.fullname) || movedAfterError) {
      this.load();
    }
  }

  // a reset video paints black at once on iOS, while the next page can take 0.4 s to show
  componentWillUnmount() {
    this.unload(true);
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
    if (native) {
      video.src = this.src;
    } else {
      const loading = this.loading = {};
      let Hls;
      try {
        ({ default: Hls } = await import('hls.js/light'));
      } catch {
        if (this.loading === loading) this.fail(NETWORK);
        return;
      }
      if (this.loading !== loading) {
        return;
      }
      // start where playback starts (deep links, seeks during the download), not at segment 0
      this.hls = new Hls({ maxBufferLength: 40, startPosition: Math.max(0, this.videoTime(currentOffset())) });
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.on(Hls.Events.BUFFER_CODECS, (_, data) => this.props.onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.loadSource(this.src);
      this.hls.attachMedia(video);
    }
    if (this.props.desiredPlaySpeed) {
      this.props.dispatch(play(this.props.desiredPlaySpeed));
    }
  }

  // Stop the video and hand the clock back to Redux first, since the teardown resets currentTime.
  // Returns the offset handed back, if any. `later` resets the element after the next paint.
  unload(later = false) {
    const offset = setVideo(null);
    this.loading = null;
    const { hls } = this;
    const video = this.video.current;
    this.hls = null;
    const reset = () => {
      hls?.destroy();
      if (video?.getAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
    };
    if (later) requestAnimationFrame(() => setTimeout(reset));
    else reset();
    return offset;
  }

  // The wall clock keeps the map and timeline moving without video.
  fail(error) {
    // the hand-back moves offset; only a later seek should retry
    this.failedAt = this.unload();
    this.setState({ buffering: false, error });
  }

  onLoadedMetadata() {
    videoReady();
    const { audioTracks } = this.video.current;
    if (!this.hls && audioTracks) {
      this.props.onAudioStatusChange?.(audioTracks.length > 0);
    }
  }

  onError() {
    const { error } = this.video.current;
    // hls.js reports its own errors; code 1 is an abort we asked for
    if (this.hls || !error || error.code === 1) {
      return;
    }
    if (error.code !== 4) {
      this.fail(error.code === 2 ? NETWORK : UNPLAYABLE);
      return;
    }
    // native HLS reports a missing playlist as "unsupported": ask the server which it was
    fetch(this.src).then(
      (resp) => this.fail(resp.status === 404 ? ROUTE_NOT_UPLOADED : UNPLAYABLE),
      () => this.fail(NETWORK),
    );
  }

  onHlsError(_, data) {
    if (!data.fatal) {
      return;
    }
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
    if (this.props.desiredPlaySpeed && !this.video.current.ended) {
      this.props.dispatch(pause());
    }
  }

  onPlay() {
    if (!this.props.desiredPlaySpeed) {
      this.props.dispatch(play(this.video.current.playbackRate));
    }
  }

  videoTime(offset) {
    return (offset - (this.props.currentRoute?.videoStartOffset || 0)) / 1000;
  }

  // A selection that starts after the video ends has no video to loop: stay paused at the end.
  onEnded() {
    const { desiredPlaySpeed, dispatch, loop } = this.props;
    const start = loop?.startTime || 0;
    if (this.videoTime(start) >= this.video.current.duration - 0.1) {
      dispatch(pause());
      return;
    }
    dispatch(seek(start));
    dispatch(play(desiredPlaySpeed || 1));
  }

  // Wrap at the end of the selected range, or stop if the range ends before the video starts.
  onTimeUpdate() {
    const { dispatch, loop } = this.props;
    const video = this.video.current;
    if (!loop?.duration || video.seeking) {
      return;
    }
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
    const showSpinner = buffering && !error && desiredPlaySpeed > 0;

    return (
      // as wide as fits; on screens tall enough for video and controls together (desktop), short
      // enough that the controls below stay on screen (about 390 px of header, timeline and
      // controls). From 700 px up that still leaves the video about 490 px wide; shorter screens
      // (landscape phones) scroll anyway, so they get the full width.
      <div className="relative w-full max-w-[964px] [@media(min-height:700px)]:w-[min(100%,calc((100dvh-390px)*1.593))] m-[0_auto] aspect-[1.593] overflow-hidden rounded-lg bg-black">
        <video
          ref={this.video}
          className="w-full h-full object-contain cursor-pointer"
          playsInline
          preload="auto"
          muted={isMuted}
          onClick={this.togglePlay}
          onLoadedMetadata={this.onLoadedMetadata}
          onLoadedData={() => this.setState({ picture: true })}
          onEmptied={() => this.setState({ picture: false })}
          onLoadStart={() => this.setState({ buffering: true })}
          onWaiting={() => this.setState({ buffering: true })}
          onSeeking={() => this.setState({ buffering: true })}
          onCanPlay={() => this.setState({ buffering: false })}
          onPlaying={() => this.setState({ buffering: false })}
          onSeeked={() => this.setState({ buffering: false })}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onEnded={this.onEnded}
          onTimeUpdate={this.onTimeUpdate}
          onError={this.onError}
        />
        {showSpinner && (
          // waits 300 ms over a picture, so quick seeks do not flash it; an empty player shows it now
          <div className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 ${picture ? 'animate-[fadein_200ms_300ms_both]' : ''}`}>
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
              onClick={this.load}
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
