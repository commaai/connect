import React, { Component } from 'react';
import { connect } from 'react-redux';

import { api } from '../../api/backend';
import { ErrorOutline } from '../../icons';
import { setVideo, videoReady } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';

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
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.load();
    }
  }

  componentWillUnmount() {
    setVideo(null);
    this.unload();
  }

  // Play the current route from the current playback offset.
  async load() {
    const { currentRoute, desiredPlaySpeed, dispatch } = this.props;
    const video = this.video.current;
    this.unload();
    this.setState({ buffering: true, error: null });
    if (!currentRoute) {
      setVideo(null);
      return;
    }

    setVideo(video);
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // Safari 17+ (macOS, iPadOS, iOS) plays HLS natively, keeping AirPlay and the system audio
    // session; iPhones before iOS 17.1 have no MediaSource at all. Everything else gets hls.js.
    if (!window.MediaSource || (window.ManagedMediaSource && video.canPlayType('application/vnd.apple.mpegurl'))) {
      video.src = src;
    } else {
      const loading = this.loading = {};
      const { default: Hls } = await import('hls.js/light');
      if (this.loading !== loading) {
        return;
      }
      this.hls = new Hls({ maxBufferLength: 40 });
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.on(Hls.Events.BUFFER_CODECS, (_, data) => this.props.onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
    }
    if (desiredPlaySpeed) {
      dispatch(play(desiredPlaySpeed));
    }
  }

  unload() {
    this.loading = null;
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const video = this.video.current;
    if (video?.getAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }

  fail(error) {
    // hand the clock back before the teardown resets currentTime; the wall clock keeps the map and
    // timeline moving without video
    setVideo(null);
    this.unload();
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
    this.fail(error.code === 2 ? NETWORK : UNPLAYABLE);
  }

  onHlsError(_, data) {
    if (!data.fatal) {
      return;
    }
    if (data.type === 'mediaError' && Date.now() - this.lastMediaRecovery > 5000) {
      this.lastMediaRecovery = Date.now();
      this.hls.recoverMediaError();
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

  onEnded() {
    const { desiredPlaySpeed, dispatch, loop } = this.props;
    dispatch(seek(loop?.startTime || 0));
    dispatch(play(desiredPlaySpeed || 1));
  }

  // Wrap at the end of the selected range.
  onTimeUpdate() {
    const { currentRoute, dispatch, loop } = this.props;
    if (!loop?.duration) {
      return;
    }
    const offset = (currentRoute?.videoStartOffset || 0) + (this.video.current.currentTime * 1000);
    if (offset >= loop.startTime + loop.duration || offset < loop.startTime - 1000) {
      dispatch(seek(loop.startTime));
    }
  }

  togglePlay() {
    const { desiredPlaySpeed, dispatch } = this.props;
    dispatch(desiredPlaySpeed ? pause() : play(this.video.current.playbackRate || 1));
  }

  render() {
    const { isMuted } = this.props;
    const { buffering, error } = this.state;
    const showSpinner = buffering && !error;

    return (
      <div className="relative max-w-[964px] m-[0_auto] aspect-[1.593] min-h-[200px] overflow-hidden rounded-lg bg-black">
        <video
          ref={this.video}
          className="w-full h-full object-contain"
          playsInline
          preload="auto"
          muted={isMuted}
          onClick={this.togglePlay}
          onLoadedMetadata={this.onLoadedMetadata}
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
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200 ${showSpinner ? 'opacity-100 delay-300' : 'opacity-0'}`}
        >
          <div role="status" aria-label="Loading video" className="size-12 rounded-full border-4 border-white/25 border-t-white animate-spin" />
        </div>
        {error && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#16181AE6] p-6 text-center text-white">
            <ErrorOutline />
            <p className="text-sm max-w-xs">{error}</p>
            <button
              type="button"
              className="rounded-full border border-white/30 px-4 py-1.5 text-sm hover:bg-white/10"
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
});

export default connect(stateToProps)(DriveVideo);
