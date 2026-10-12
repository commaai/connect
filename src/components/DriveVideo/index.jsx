import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, setVideoClock } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const NOT_FOUND_ERROR = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video';
const MEDIA_ERR_NETWORK = 2;

// only show the spinner if loading takes a moment, so short seeks don't flash it
const LOADING_DELAY = 300;

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <button
          type="button"
          className="mt-3 px-4 py-1 rounded-full border border-white/30 text-sm text-white hover:bg-white/10"
          onClick={onRetry}
        >
          Retry
        </button>
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

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.getOffset = this.getOffset.bind(this);
    this.onRetry = this.onRetry.bind(this);

    this.videoRef = React.createRef();
    this.videoEvents = {
      loadedmetadata: this.onLoadedMetadata.bind(this),
      waiting: this.onWaiting.bind(this),
      seeking: this.onWaiting.bind(this),
      canplay: this.onReady.bind(this),
      playing: this.onReady.bind(this),
      seeked: this.onReady.bind(this),
      pause: this.onPause.bind(this),
      play: this.onPlay.bind(this),
      timeupdate: this.onTimeUpdate.bind(this),
      ended: this.onEnded.bind(this),
      error: this.onVideoError.bind(this),
    };

    this.hls = null;
    this.loadId = 0;
    this.pendingOffset = 0;
    this.recoveredMediaError = false;
    this.loadingTimer = null;

    this.state = {
      loading: true,
      error: null,
    };
  }

  componentDidMount() {
    const video = this.videoRef.current;
    Object.entries(this.videoEvents).forEach(([event, handler]) => video.addEventListener(event, handler));
    this.loadSource();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, desiredPlaySpeed, offset, startTime } = this.props;
    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      this.loadSource();
      return;
    }

    if (prevProps.offset !== offset || prevProps.startTime !== startTime) {
      this.seekVideo(offset);
    }
    if (prevProps.desiredPlaySpeed !== desiredPlaySpeed && this.hasMetadata()) {
      this.applyPlaySpeed();
    }
  }

  componentWillUnmount() {
    const video = this.videoRef.current;
    Object.entries(this.videoEvents).forEach(([event, handler]) => video.removeEventListener(event, handler));
    clearTimeout(this.loadingTimer);

    // hand the position back to the wall clock, so the map keeps playing without the video
    const offset = currentOffset();
    setVideoClock(null);
    this.detachSource();
    if (this.props.currentRoute) {
      this.props.dispatch(seek(offset));
    }
  }

  onLoadedMetadata() {
    const { onAudioStatusChange } = this.props;
    const video = this.videoRef.current;
    video.currentTime = this.videoTime(this.pendingOffset);
    if (isIos()) {
      // native hls on ios exposes the audio tracks, hls.js reports codecs instead
      onAudioStatusChange?.(video.audioTracks?.length > 0);
    }
    this.applyPlaySpeed();
  }

  onWaiting() {
    clearTimeout(this.loadingTimer);
    this.loadingTimer = setTimeout(() => this.setState({ loading: true }), LOADING_DELAY);
  }

  onReady() {
    clearTimeout(this.loadingTimer);
    if (this.state.loading || this.state.error) {
      this.setState({ loading: false, error: null });
    }
  }

  // paused from outside the app, e.g. lock screen, headphones or picture-in-picture
  onPause() {
    const video = this.videoRef.current;
    if (video.paused && !video.ended && this.props.desiredPlaySpeed) {
      this.props.dispatch(pause());
    }
  }

  onPlay() {
    const video = this.videoRef.current;
    if (!video.paused && !this.props.desiredPlaySpeed) {
      this.props.dispatch(play(video.playbackRate || 1));
    }
  }

  onTimeUpdate() {
    const { loop, dispatch } = this.props;
    if (loop && currentOffset() > loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }
  }

  onEnded() {
    const { loop, dispatch } = this.props;
    dispatch(seek(loop?.startTime || 0));
    this.applyPlaySpeed();
  }

  onVideoError() {
    const { error } = this.videoRef.current;
    if (!error) {
      return;
    }
    this.setState({ loading: false, error: error.code === MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR });
  }

  onHlsError(Hls, data) {
    if (!data.fatal) {
      // hls.js recovers from these by itself
      return;
    }

    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.pendingOffset = currentOffset();
      this.hls.recoverMediaError();
      return;
    }

    let error = LOAD_ERROR;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      error = data.response?.code === 404 ? NOT_FOUND_ERROR : NETWORK_ERROR;
    }
    this.setState({ loading: false, error });
  }

  onRetry() {
    this.loadSource();
  }

  getOffset() {
    const video = this.videoRef.current;
    if (!this.hasMetadata()) {
      return this.pendingOffset;
    }
    return (this.props.currentRoute?.videoStartOffset || 0) + (video.currentTime * 1000);
  }

  hasMetadata() {
    const video = this.videoRef.current;
    return Boolean(video) && video.readyState >= HTMLMediaElement.HAVE_METADATA;
  }

  videoTime(offset) {
    const { currentRoute } = this.props;
    return Math.max(0, (offset - (currentRoute?.videoStartOffset || 0)) / 1000);
  }

  seekVideo(offset) {
    const video = this.videoRef.current;
    if (!this.hasMetadata()) {
      this.pendingOffset = offset;
      return;
    }
    // play and pause store the current position, which should not trigger a seek
    const time = this.videoTime(offset);
    if (Math.abs(time - video.currentTime) > 0.05) {
      video.currentTime = time;
    }
  }

  applyPlaySpeed() {
    const { desiredPlaySpeed, dispatch } = this.props;
    const video = this.videoRef.current;
    if (!desiredPlaySpeed) {
      video.pause();
      return;
    }

    video.playbackRate = desiredPlaySpeed;
    video.play()?.catch((err) => {
      if (err.name === 'NotAllowedError') {
        // autoplay blocked, e.g. ios low power mode, show the play button instead of a spinner
        dispatch(pause());
      }
    });
  }

  detachSource() {
    this.loadId += 1;
    this.hls?.destroy();
    this.hls = null;

    const video = this.videoRef.current;
    video.removeAttribute('src');
    video.load();
  }

  async loadSource() {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.videoRef.current;

    this.pendingOffset = currentOffset();
    this.detachSource();
    this.recoveredMediaError = false;
    this.setState({ loading: true, error: null });
    onAudioStatusChange?.(false);

    if (!currentRoute) {
      setVideoClock(null);
      return;
    }
    setVideoClock({ route: currentRoute.fullname, getOffset: this.getOffset });

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    if (isIos()) {
      video.src = src;
      return;
    }

    const { loadId } = this;
    let Hls;
    try {
      ({ default: Hls } = await import('hls.js'));
    } catch (err) {
      console.error('Failed to load hls.js', err);
      this.setState({ loading: false, error: NETWORK_ERROR });
      return;
    }
    if (loadId !== this.loadId) {
      return;
    }

    if (!Hls.isSupported()) {
      video.src = src;
      return;
    }

    const hls = new Hls({ maxBufferLength: 40 });
    hls.on(Hls.Events.ERROR, (_, data) => this.onHlsError(Hls, data));
    hls.on(Hls.Events.BUFFER_CODECS, (_, data) => onAudioStatusChange?.(Boolean(data.audio)));
    hls.loadSource(src);
    hls.attachMedia(video);
    this.hls = hls;
  }

  render() {
    const { isMuted } = this.props;
    const { loading, error } = this.state;

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={loading} error={error} onRetry={this.onRetry} />
        <video
          ref={this.videoRef}
          className="w-full h-full"
          muted={isMuted}
          playsInline
          preload="auto"
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  startTime: state.startTime,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
