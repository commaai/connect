import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachVideo, currentOffset, detachVideo, storeOffset } from '../../timeline';
import { bufferVideo, pause, play, seek } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const LOAD_FAILED = 'Unable to load video';
const NETWORK_FAILED = 'Unable to load video. Check network connection.';

// a store position this far from the video's is a seek, anything closer is the same moment
const SEEK_THRESHOLD = 250;

const VideoOverlay = ({ loading, error }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
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

// Plays the drive's qcamera stream. Once loaded, the <video> is the playback clock
// (see timeline/currentOffset); the store only says what the user asked for: seek,
// play, pause, speed. Media events report buffering and outside pauses back to it.
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.videoRef = React.createRef();
    this.hls = null;
    this.clock = null;
    this.recoveredMediaError = false;

    this.state = {
      videoError: null,
    };

    [
      'onLoadedMetadata', 'onBuffering', 'onReady', 'onTimeUpdate', 'onPause', 'onPlay', 'onEnded',
      'onVideoError', 'onHlsError',
    ].forEach((handler) => { this[handler] = this[handler].bind(this); });
  }

  componentDidMount() {
    this.loadRoute();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, offset, startTime, loop } = this.props;
    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      this.loadRoute();
      return;
    }
    if (this.clock) {
      // the first camera frame is only known once the drive's events load
      this.clock.startOffset = this.videoStartOffset();
    }
    if (prevProps.offset !== offset || prevProps.startTime !== startTime || prevProps.loop !== loop) {
      this.followSeek();
    }
    this.applyPlayback();
  }

  componentWillUnmount() {
    if (this.clock) {
      // hand the position back to the store so playback continues from here without a video
      this.props.dispatch(seek(currentOffset(this.props)));
    }
    this.unload();
  }

  get video() {
    return this.videoRef.current;
  }

  videoStartOffset() {
    return this.props.currentRoute?.videoStartOffset || 0;
  }

  async loadRoute() {
    this.unload();
    this.setState({ videoError: null });

    const { currentRoute, dispatch } = this.props;
    const { video } = this;
    if (!currentRoute || !video) {
      return;
    }
    dispatch(bufferVideo(true));

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    if (isIos()) {
      // iOS has no MediaSource on iPhone and plays HLS natively
      video.src = src;
      return;
    }

    let Hls;
    try {
      ({ default: Hls } = await import('hls.js/light'));
    } catch (err) {
      console.error('Failed to load hls.js', err);
      this.setState({ videoError: LOAD_FAILED });
      return;
    }
    if (this.props.currentRoute?.fullname !== currentRoute.fullname || !this.video) {
      return; // switched route or unmounted while the chunk loaded
    }
    if (!Hls.isSupported()) {
      this.setState({ videoError: LOAD_FAILED });
      return;
    }
    const hls = new Hls({ maxBufferLength: 40 });
    hls.on(Hls.Events.ERROR, this.onHlsError);
    hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => this.props.onAudioStatusChange?.(Boolean(data.audio)));
    hls.loadSource(src);
    hls.attachMedia(video);
    this.hls = hls;
    this.recoveredMediaError = false;
  }

  unload() {
    if (this.clock) {
      detachVideo(this.clock);
      this.clock = null;
    }
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    const { video } = this;
    if (video?.getAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }

  // video time, in seconds, for a drive offset in ms
  videoTime(offset) {
    return Math.max(0, (offset - this.videoStartOffset()) / 1000);
  }

  // The store moved (seek, loop change): move the video there unless it is already close.
  followSeek() {
    const { video } = this;
    if (!this.clock || !video) {
      return;
    }
    const target = storeOffset(this.props);
    const current = (video.currentTime * 1000) + this.videoStartOffset();
    if (Math.abs(target - current) > SEEK_THRESHOLD) {
      video.currentTime = this.videoTime(target);
    }
  }

  applyPlayback() {
    const { video } = this;
    if (!this.clock || !video) {
      return;
    }
    const { desiredPlaySpeed, isMuted } = this.props;
    if (!desiredPlaySpeed) {
      if (!video.paused) video.pause();
      return;
    }
    // browsers top out at 16x; firefox mutes audio above 8x
    video.playbackRate = Math.min(desiredPlaySpeed, (isFirefox() && !isMuted) ? 8 : 16);
    if (video.paused) {
      video.play()?.catch((err) => {
        if (err.name === 'NotAllowedError') {
          this.props.dispatch(pause()); // autoplay blocked: show it as paused
        }
      });
    }
  }

  onLoadedMetadata() {
    const { video } = this;
    video.currentTime = this.videoTime(storeOffset(this.props));
    this.clock = { element: video, startOffset: this.videoStartOffset() };
    attachVideo(this.clock);
    if (isIos()) {
      this.props.onAudioStatusChange?.(Boolean(video.audioTracks?.length));
    }
    this.applyPlayback();
  }

  onBuffering() {
    if (!this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  onReady() {
    if (this.props.isBufferingVideo && this.video.readyState >= 3) {
      this.props.dispatch(bufferVideo(false));
    }
    if (this.state.videoError) {
      this.setState({ videoError: null });
    }
  }

  onTimeUpdate() {
    const { loop } = this.props;
    if (!this.clock || !loop) {
      return;
    }
    const offset = (this.video.currentTime * 1000) + this.videoStartOffset();
    if (offset >= loop.startTime + loop.duration) {
      this.props.dispatch(seek(loop.startTime));
    }
  }

  // paused from outside the page (OS media controls, another tab taking audio focus)
  onPause() {
    const { video } = this;
    if (this.props.desiredPlaySpeed && !video.seeking && !video.ended && video.readyState >= 2) {
      this.props.dispatch(pause());
    }
  }

  onPlay() {
    if (!this.props.desiredPlaySpeed) {
      this.props.dispatch(play());
    }
  }

  onEnded() {
    const { loop } = this.props;
    this.props.dispatch(seek(loop?.startTime ?? 0));
  }

  onVideoError() {
    const { error } = this.video;
    if (!error || this.hls) {
      return; // hls.js reports its own errors
    }
    this.props.dispatch(bufferVideo(true));
    this.setState({ videoError: error.code === error.MEDIA_ERR_NETWORK ? NETWORK_FAILED : LOAD_FAILED });
  }

  onHlsError(_event, data) {
    if (!data.fatal) {
      return; // hls.js recovers from these on its own
    }
    if (data.type === 'mediaError' && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.hls.recoverMediaError();
      return;
    }

    this.props.dispatch(bufferVideo(true));
    let videoError = LOAD_FAILED;
    if (data.response?.code === 404) {
      videoError = NOT_UPLOADED;
    } else if (data.type === 'networkError') {
      videoError = NETWORK_FAILED;
    }
    this.setState({ videoError });
  }

  render() {
    const { isBufferingVideo, isMuted } = this.props;
    const { videoError } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <video
          ref={this.videoRef}
          className="block w-full h-full"
          playsInline
          muted={isMuted}
          preload="auto"
          onLoadedMetadata={this.onLoadedMetadata}
          onWaiting={this.onBuffering}
          onSeeking={this.onBuffering}
          onCanPlay={this.onReady}
          onPlaying={this.onReady}
          onSeeked={this.onReady}
          onTimeUpdate={this.onTimeUpdate}
          onPause={this.onPause}
          onPlay={this.onPlay}
          onEnded={this.onEnded}
          onError={this.onVideoError}
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
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
