import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import {
  setPlaybackSpeed, resetPlayback, play, pause, videoProgress, setHasAudio, setVideoStatus, VideoStatus,
} from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const MISSING_VIDEO = 'This video segment has not uploaded yet or has been deleted.';

const VideoOverlay = ({ loading, error, onRetry }) => (
  <div
    className={`z-50 absolute inset-0 flex flex-col items-center justify-center text-center bg-[#16181AAA] transition-opacity
      ${error || loading ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${loading && !error ? 'delay-300' : ''}`}
  >
    {error ? (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        {onRetry && (
          <button type="button" className="mt-3 rounded-full bg-white/10 px-4 py-1 text-sm text-white hover:bg-white/20" onClick={onRetry}>
            Retry
          </button>
        )}
      </>
    ) : (
      <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
    )}
  </div>
);

class RouteVideo extends Component {
  video = React.createRef();
  ready = false;
  missing = [];
  state = { videoError: null, canRetry: false };

  componentDidMount() {
    this.props.dispatch(resetPlayback());
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
    window.addEventListener('online', this.onOnline);
    this.load();
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, loop, offset, currentRoute, isPlaying, desiredPlaySpeed } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.seekTo(seekRequest.offset);
    } else if (loop !== prevProps.loop
      || (currentRoute.videoStartOffset || 0) !== (prevProps.currentRoute.videoStartOffset || 0)) {
      this.seekTo(offset);
    }
    if (isPlaying !== prevProps.isPlaying || desiredPlaySpeed !== prevProps.desiredPlaySpeed) {
      this.syncPlayback();
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('online', this.onOnline);
    this.hls?.destroy();
  }

  load = async () => {
    const { currentRoute, dispatch } = this.props;
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // iOS plays HLS natively, elsewhere hls.js gives faster seeking and better errors
    const Hls = isIos() ? null : (await import('hls.js/light')).default;
    if (this.unmounted) return;
    if (!Hls?.isSupported()) {
      this.video.current.src = src;
      return;
    }
    this.hls = new Hls({
      startPosition: this.toSeconds(this.props.offset),
      ...api.video.getHlsOptions?.(currentRoute, Hls),
    });
    this.hls.on(Hls.Events.ERROR, (_event, data) => this.onHlsError(data));
    this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => dispatch(setHasAudio(!!data.audio)));
    this.hls.loadSource(src);
    this.hls.attachMedia(this.video.current);
  };

  retry = () => {
    this.hls?.destroy();
    this.hls = null;
    this.ready = false;
    this.setState({ videoError: null, canRetry: false });
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
    this.load();
  };

  onOnline = () => {
    if (this.state.canRetry) this.retry();
  };

  toSeconds = (offset) => Math.max(0, (offset - (this.props.currentRoute.videoStartOffset || 0)) / 1000);

  seekTo = (offset) => {
    if (!this.ready) return; // onLoadedMetadata applies the latest offset after loading.
    const { currentRoute, loop } = this.props;
    const start = loop?.startTime ?? 0;
    const end = loop ? start + loop.duration : currentRoute.duration;
    this.setCurrentTime(this.toSeconds(Math.max(start, Math.min(offset, end))));
  };

  findGap = (seconds, tolerance = 0) => this.missing.find((frag) => seconds >= frag.start - tolerance && seconds < frag.end);

  setCurrentTime = (seconds, restartLoading = false) => {
    const gap = this.findGap(seconds);
    if (gap) {
      this.skipGap(gap);
      return;
    }
    this.video.current.currentTime = seconds;
    // hls.js loads from the media's position, so only restart it once the position has moved
    if (this.hls && (restartLoading || !this.hls.loadingEnabled)) this.hls.startLoad(seconds);
  };

  // A missing segment won't appear by retrying, so continue after it like any gap in the recording.
  skipGap = (gap) => {
    if (gap.end >= this.video.current.duration - 0.5) {
      this.onEnded();
    } else {
      // the media rounds currentTime, land clearly inside the next fragment
      this.setCurrentTime(gap.end + 0.1, true);
    }
  };

  syncPlayback = () => {
    const video = this.video.current;
    const { isPlaying, desiredPlaySpeed, dispatch } = this.props;
    video.playbackRate = desiredPlaySpeed;
    if (!this.ready) return;
    if (!isPlaying) {
      video.pause();
    } else if (video.paused) {
      video.play().catch((error) => {
        if (error.name === 'NotAllowedError') {
          dispatch(setVideoStatus(VideoStatus.READY));
          dispatch(pause()); // Leave the play button available after blocked autoplay.
        }
      });
    }
  };

  onLoadedMetadata = () => {
    this.ready = true;
    this.seekTo(this.props.offset);
    if (!this.hls) this.props.dispatch(setHasAudio(!!this.video.current.audioTracks?.length));
    this.syncPlayback();
  };

  onAnimationFrame = () => {
    this.updateOffset();
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  updateOffset = () => {
    const video = this.video.current;
    const { currentRoute, dispatch, loop, isPlaying, offset, videoStatus } = this.props;
    if (!this.ready || video.seeking || videoStatus === VideoStatus.FAILED) return;
    const nextOffset = Math.round(video.currentTime * 1000) + (currentRoute.videoStartOffset || 0);
    if (isPlaying && loop?.duration > 0 && nextOffset >= loop.startTime + loop.duration
      && loop.startTime + loop.duration > (currentRoute.videoStartOffset || 0)) {
      this.seekTo(loop.startTime);
    } else if (nextOffset !== offset) {
      dispatch(videoProgress(nextOffset));
    }
  };

  onPlayable = () => {
    const video = this.video.current;
    if (video.seeking || video.readyState < 2) return;
    this.setState({ videoError: null, canRetry: false });
    this.props.dispatch(setVideoStatus(VideoStatus.READY));
  };

  onWaiting = () => {
    const gap = this.findGap(this.video.current.currentTime, 0.5);
    if (gap) {
      this.skipGap(gap);
    } else if (this.props.videoStatus !== VideoStatus.FAILED) {
      this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
    }
  };

  onSeeking = () => {
    this.setState({ videoError: null, canRetry: false });
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
  };

  onEnded = () => {
    const { isPlaying, loop, dispatch } = this.props;
    if (isPlaying && loop?.duration > 0) {
      this.seekTo(loop.startTime);
      this.video.current.play().catch(() => {});
    } else {
      dispatch(pause());
    }
  };

  onHlsError = (data) => {
    const code = data.response?.code;
    if (data.details === 'fragLoadError' && code >= 400 && code < 500) {
      if (!this.missing.includes(data.frag)) this.missing.push(data.frag);
      // when it was loaded ahead of the playhead, onWaiting skips it once playback gets there
      const gap = this.findGap(this.video.current.currentTime, 0.5);
      if (gap) this.skipGap(gap);
      return;
    }
    if (!data.fatal) return; // hls.js handles retries and buffer stalls.
    if (data.type === 'mediaError' && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.hls.recoverMediaError();
      return;
    }
    this.fail(code === 404 ? MISSING_VIDEO : 'Unable to load video', code !== 404);
  };

  onVideoError = () => {
    if (!this.hls) this.fail('Unable to load video', true);
  };

  fail = (videoError, canRetry) => {
    this.props.dispatch(setVideoStatus(VideoStatus.FAILED));
    this.setState({ videoError, canRetry });
  };

  render() {
    const { isMuted, isPlaying, desiredPlaySpeed, videoStatus, dispatch } = this.props;
    const { videoError, canRetry } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={videoStatus === VideoStatus.LOADING}
          error={videoError}
          onRetry={canRetry ? this.retry : null}
        />
        <video
          ref={this.video}
          className={`w-full h-full ${videoError ? 'invisible' : ''}`}
          playsInline
          muted={isMuted}
          preload="auto"
          onLoadedMetadata={this.onLoadedMetadata}
          onTimeUpdate={this.updateOffset}
          onCanPlay={this.onPlayable}
          onPlaying={this.onPlayable}
          onSeeked={this.onPlayable}
          onSeeking={this.onSeeking}
          onWaiting={this.onWaiting}
          onPlay={() => {
            if (!isPlaying) dispatch(play());
          }}
          onPause={() => {
            if (isPlaying && !this.video.current.ended) dispatch(pause());
          }}
          onRateChange={() => {
            const { playbackRate } = this.video.current;
            if (this.ready && playbackRate !== desiredPlaySpeed) dispatch(setPlaybackSpeed(playbackRate));
          }}
          onEnded={this.onEnded}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const DriveVideo = (props) => props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} />
  : null;

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRequest: state.seekRequest,
  currentRoute: state.currentRoute,
  loop: state.loop,
  isPlaying: state.isPlaying,
  videoStatus: state.videoStatus,
});

export default connect(stateToProps)(DriveVideo);
