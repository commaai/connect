import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, RefreshIcon } from '../../icons';
import { clampToLoop, pause, play, resetPlayback, videoProgress } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const MISSING_VIDEO_ERROR = 'This video segment has not uploaded yet or has been deleted.';
const LOAD_ERROR = 'Unable to load video';
// native HLS reports no error when it cannot load segments, it just waits
const STALL_TIMEOUT = 15000;

// iOS plays HLS natively; everywhere else hls.js gives us fragment errors and audio detection
const useNativeHls = () => isIos() || !window.MediaSource;

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button
          className="mt-3 rounded-3xl px-5 text-white normal-case bg-white/10 hover:bg-white/20"
          onClick={onRetry}
          disableRipple
        >
          <RefreshIcon className="mr-2" style={{ fontSize: 20 }} />
          Retry
        </Button>
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

class RouteVideo extends Component {
  constructor(props) {
    super(props);

    this.video = React.createRef();
    this.hls = null;
    this.ready = false;
    this.missingFrags = [];

    this.onFrame = this.onFrame.bind(this);
    this.publishOffset = this.publishOffset.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onSeeking = this.onSeeking.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onSeeked = this.onSeeked.bind(this);
    this.reload = this.reload.bind(this);
    this.setLoading = this.setLoading.bind(this);
    this.setLoaded = this.setLoaded.bind(this);

    this.state = {
      loading: true,
      videoError: null,
    };
  }

  componentDidMount() {
    const { dispatch, onAudioStatusChange } = this.props;
    dispatch(resetPlayback());
    dispatch(play());
    onAudioStatusChange?.(false);
    this.setLoading();
    this.attachSource();
    this.frame = requestAnimationFrame(this.onFrame);
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, loop, isPlaying, desiredPlaySpeed, offset } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.seekTo(seekRequest.offset);
    } else if (loop?.startTime !== prevProps.loop?.startTime || loop?.duration !== prevProps.loop?.duration) {
      this.seekTo(offset);
    }
    if (isPlaying !== prevProps.isPlaying) {
      this.applyPlayState();
    }
    if (desiredPlaySpeed !== prevProps.desiredPlaySpeed) {
      this.applySpeed();
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    cancelAnimationFrame(this.frame);
    clearTimeout(this.stallTimer);
    if (this.hls) {
      this.hls.destroy();
    } else if (useNativeHls()) {
      // stop native HLS from downloading in the background
      this.video.current.removeAttribute('src');
      this.video.current.load();
    }
  }

  async attachSource() {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.video.current;
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

    if (useNativeHls()) {
      video.src = src;
    } else {
      const { default: Hls } = await import('hls.js/light');
      if (!this.video.current || this.hls) {
        return;
      }
      this.hls = new Hls({
        maxBufferLength: 40,
        startPosition: this.videoTime(clampToLoop(this.props.offset, this.props.loop)),
        ...api.video.getHlsOptions?.(currentRoute),
      });
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
    }

    this.applySpeed();
    this.applyPlayState();
  }

  videoTime(offset) {
    const { currentRoute } = this.props;
    return Math.max(0, ((offset ?? 0) - (currentRoute.videoStartOffset || 0)) / 1000);
  }

  seekTo(offset) {
    const time = this.videoTime(clampToLoop(offset, this.props.loop));
    if (this.ready) {
      this.video.current.currentTime = time;
    } else if (this.hls || this.state.videoError) {
      // nothing playable yet (e.g. the first segment is missing): start over from the seek target
      this.reload();
    }
  }

  reload() {
    this.ready = false;
    this.missingFrags = [];
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.setState({ videoError: null });
    this.setLoading();
    this.attachSource();
  }

  applyPlayState() {
    const video = this.video.current;
    if (!this.props.isPlaying) {
      video.pause();
      return;
    }
    video.play()?.catch((err) => {
      if (err.name === 'NotAllowedError' && !this.unmounted) {
        // autoplay blocked (e.g. iOS low power mode): show the play button
        this.props.dispatch(pause());
        this.setLoaded();
      }
    });
  }

  applySpeed() {
    const video = this.video.current;
    video.defaultPlaybackRate = this.props.desiredPlaySpeed;
    video.playbackRate = this.props.desiredPlaySpeed;
  }

  onFrame() {
    this.publishOffset();
    this.frame = requestAnimationFrame(this.onFrame);
  }

  // also called on timeupdate, since animation frames stop in background tabs
  publishOffset() {
    const { currentRoute, dispatch, isPlaying, loop, offset } = this.props;
    const video = this.video.current;
    if (this.ready && !video.seeking && !this.state.videoError) {
      const videoStartOffset = currentRoute.videoStartOffset || 0;
      const videoOffset = Math.round(video.currentTime * 1000) + videoStartOffset;
      const loopEnd = loop ? loop.startTime + loop.duration : null;
      if (isPlaying && loopEnd !== null && videoOffset >= loopEnd && loopEnd > videoStartOffset) {
        this.seekTo(loop.startTime);
      } else if (videoOffset !== offset) {
        dispatch(videoProgress(videoOffset));
      }
    }
  }

  onLoadedMetadata() {
    const { onAudioStatusChange } = this.props;
    this.ready = true;
    this.seekTo(this.props.offset);
    if (!this.hls) {
      onAudioStatusChange?.(this.video.current.audioTracks?.length > 0);
    }
  }

  onPlay() {
    if (!this.props.isPlaying) {
      this.props.dispatch(play());
    }
  }

  onPause() {
    if (this.props.isPlaying && !this.video.current.ended) {
      this.props.dispatch(pause());
    }
  }

  onSeeking() {
    this.setState({ videoError: null });
    this.setLoading();
    if (this.hls && !this.hls.loadingEnabled) {
      // hls.js stops loading after a fatal error; seeking elsewhere retries from there
      this.hls.startLoad(this.video.current.currentTime);
    }
  }

  onEnded() {
    const { dispatch, isPlaying, loop } = this.props;
    if (isPlaying && loop) {
      this.seekTo(loop.startTime);
      this.applyPlayState();
    } else {
      dispatch(pause());
    }
  }

  onHlsError(_event, data) {
    if (data.frag && data.response?.code === 404) {
      // hls.js loads ahead, so a missing segment is only an error once playback reaches it
      this.missingFrags.push(data.frag);
      this.checkMissing();
    } else if (data.fatal) {
      this.showError(LOAD_ERROR);
    }
  }

  onVideoError() {
    if (useNativeHls()) {
      this.showError(LOAD_ERROR);
    }
  }

  onSeeked() {
    // seeking can finish with no frame to show, e.g. when native HLS cannot load the segment
    if (this.video.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.setLoaded();
    }
  }

  onPlaying() {
    this.setState({ videoError: null });
    this.setLoaded();
  }

  checkMissing() {
    const time = this.video.current.currentTime;
    if (this.missingFrags.some((frag) => time >= frag.start - 1 && time < frag.start + frag.duration)) {
      this.showError(MISSING_VIDEO_ERROR);
    }
  }

  showError(videoError) {
    this.setLoaded();
    this.setState({ videoError });
  }

  onWaiting() {
    this.setLoading();
    this.checkMissing();
  }

  setLoading() {
    if (!this.stallTimer) {
      this.stallTimer = setTimeout(() => this.showError(LOAD_ERROR), STALL_TIMEOUT);
    }
    this.setState({ loading: true });
  }

  setLoaded() {
    clearTimeout(this.stallTimer);
    this.stallTimer = null;
    this.setState({ loading: false });
  }

  render() {
    const { isMuted } = this.props;
    const { loading, videoError } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={loading} error={videoError} onRetry={this.reload} />
        <video
          ref={this.video}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          onLoadedMetadata={this.onLoadedMetadata}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onSeeking={this.onSeeking}
          onWaiting={this.onWaiting}
          onCanPlay={this.setLoaded}
          onPlaying={this.onPlaying}
          onSeeked={this.onSeeked}
          onTimeUpdate={this.publishOffset}
          onEnded={this.onEnded}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const DriveVideo = (props) => (props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} />
  : null);

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  isPlaying: state.isPlaying,
  loop: state.loop,
  offset: state.offset,
  seekRequest: state.seekRequest,
});

export default connect(stateToProps)(DriveVideo);
