/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
// the ESM build of hls.js doesn't bundle its transmuxing worker
import hlsWorker from 'hls.js/dist/hls.worker.js?url';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, RefreshIcon } from '../../icons';
import { pause, play, setPlaybackSpeed, videoProgress } from '../../timeline/playback';

const VideoOverlay = ({ loading, error, onRetry }) => {
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
    <div className={`z-50 absolute h-full w-full bg-[#16181AAA] ${error ? '' : 'animate-[fadein_0.2s_0.3s_both]'}`}>
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
        {error && (
          <div>
            <Button className="mt-3 rounded-3xl px-5 normal-case text-white bg-white/10 hover:bg-white/20" onClick={onRetry}>
              <RefreshIcon className="mr-2" style={{ fontSize: 20 }} />
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

function errorMessage(httpCode) {
  if (!navigator.onLine) {
    return 'Unable to load video. Check network connection.';
  }
  if (httpCode === 404) {
    return 'This video segment has not uploaded yet or has been deleted.';
  }
  return 'Unable to load video';
}

const initialState = { buffering: true, videoError: null, noVideo: null };

class DriveVideo extends Component {
  videoPlayer = React.createRef();
  state = initialState;

  componentDidMount() {
    window.addEventListener('online', this.onOnline);
    this.loadSource();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, isPlaying, desiredPlaySpeed, seekRequest, loop } = this.props;
    if (currentRoute.fullname !== prevProps.currentRoute.fullname) {
      this.loadSource();
      return;
    }
    if ((currentRoute.videoStartOffset || 0) !== (prevProps.currentRoute.videoStartOffset || 0)) {
      this.seekTo(this.storedOffset());
    }
    if (seekRequest !== prevProps.seekRequest) {
      if (this.state.videoError) {
        this.loadSource();
      } else {
        this.clearNoVideo();
        this.seekTo(seekRequest.offset);
        // hls.js stopped at a missing segment, or is still loading the old start
        if (this.hls && (!this.hls.loadingEnabled || !this.videoPlayer.current.readyState)) {
          this.hls.startLoad(this.videoTime(seekRequest.offset));
        }
      }
    }
    // keep the "not uploaded" notice when the new selection has no video either
    if (loop !== prevProps.loop && !this.keepInLoop()) {
      this.clearNoVideo();
    }
    if (isPlaying !== prevProps.isPlaying || desiredPlaySpeed !== prevProps.desiredPlaySpeed) {
      this.updatePlayback();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.onOnline);
    cancelAnimationFrame(this.frame);
    this.hls?.destroy();
    this.pendingHls = null;
  }

  // not in stateToProps: offset changes every frame
  storedOffset() {
    return this.props.dispatch((_, getState) => getState().offset);
  }

  onLoadedMetadata = () => {
    this.seekTo(this.storedOffset());
    this.updatePlayback();
  };

  onTimeUpdate = () => {
    this.updateBuffering();
    // animation frames stop in background tabs, timeupdate doesn't
    this.keepInLoop();
    this.reportProgress();
  };

  onWaiting = () => {
    this.updateBuffering();
    this.skipMissingFrag();
  };

  onPlay = () => {
    const { isPlaying, dispatch } = this.props;
    const video = this.videoPlayer.current;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
    if (!isPlaying && !video.paused) {
      dispatch(play());
    }
  };

  onPause = () => {
    const { isPlaying, dispatch } = this.props;
    const video = this.videoPlayer.current;
    if (isPlaying && video.paused && !video.ended) {
      dispatch(pause());
    }
    this.updateBuffering();
  };

  onRateChange = () => {
    const { desiredPlaySpeed, dispatch } = this.props;
    const { playbackRate } = this.videoPlayer.current;
    if (playbackRate > 0 && playbackRate !== desiredPlaySpeed) {
      dispatch(setPlaybackSpeed(playbackRate));
    }
  };

  onEnded = () => {
    const { loop, dispatch } = this.props;
    if (loop && this.videoTime(loop.startTime) < this.videoPlayer.current.duration) {
      this.seekTo(loop.startTime);
      this.updatePlayback();
    } else {
      dispatch(pause());
    }
  };

  onVideoError = () => {
    if (!this.hls) {
      this.setState({ videoError: errorMessage() });
    }
  };

  onHlsError = (event, data) => {
    if (data.details === 'fragLoadError' && data.response?.code === 404) {
      this.missingFrag = data.frag;
      if (!this.skipMissingFrag() && data.fatal) {
        // hls.js stops loading after giving up on a fragment
        this.hls.startLoad(this.videoPlayer.current.currentTime);
      }
    } else if (data.fatal) {
      this.setState({ videoError: errorMessage(data.response?.code) });
    }
  };

  // hls.js resumes by itself when the connection comes back
  onOnline = () => {
    if (!this.hls || this.state.videoError) {
      this.loadSource();
    }
  };

  // timeupdate is ~4 Hz, too slow for the timeline and for loop ends at 8x
  tick = () => {
    if (this.videoPlayer.current.paused) {
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
    this.keepInLoop();
    this.reportProgress();
  };

  keepInLoop() {
    const { currentRoute, loop } = this.props;
    const video = this.videoPlayer.current;
    if (!loop || !video.readyState || video.seeking) {
      return false;
    }
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    const offset = video.currentTime * 1000 + videoStartOffset;
    // 1 ms of slack for float rounding after seeking to the loop start
    if (offset >= loop.startTime - 1 && offset <= loop.startTime + loop.duration) {
      return false;
    }
    if (loop.startTime + loop.duration <= videoStartOffset
      || (video.ended && this.videoTime(loop.startTime) >= video.duration)) {
      this.showNoVideo();
      return true;
    }
    this.seekTo(loop.startTime);
    return false;
  }

  showNoVideo() {
    const { isPlaying, dispatch } = this.props;
    if (!this.state.noVideo) {
      this.setState({ noVideo: { resume: isPlaying } });
    }
    if (isPlaying) {
      dispatch(pause());
    }
  }

  clearNoVideo() {
    if (this.state.noVideo?.resume) {
      this.props.dispatch(play());
    }
    this.setState({ noVideo: null });
  }

  reportProgress() {
    const { currentRoute, dispatch } = this.props;
    const video = this.videoPlayer.current;
    if (video.readyState) {
      dispatch(videoProgress(Math.round(video.currentTime * 1000) + (currentRoute.videoStartOffset || 0)));
    }
  }

  updateBuffering = () => {
    const video = this.videoPlayer.current;
    const needed = video.paused ? video.HAVE_CURRENT_DATA : video.HAVE_FUTURE_DATA;
    const buffering = video.seeking || video.readyState < needed;
    if (buffering !== this.state.buffering) {
      this.setState({ buffering });
    }
  };

  skipMissingFrag() {
    const { currentRoute, loop, dispatch } = this.props;
    const video = this.videoPlayer.current;
    const frag = this.missingFrag;
    const position = video.readyState ? video.currentTime : this.videoTime(this.storedOffset());
    // Safari keeps readyState 4 while a seek waits for a missing fragment
    const stalled = video.seeking || video.readyState < video.HAVE_FUTURE_DATA;
    if (!frag || !stalled || position <= frag.start - 1 || position >= frag.end) {
      return false;
    }
    // past maxFragLookUpTolerance (0.25 s), or hls.js picks the same fragment
    const time = frag.end + 0.3;
    if (time >= video.duration || (loop && time > this.videoTime(loop.startTime + loop.duration))) {
      this.showNoVideo();
      return true;
    }
    if (video.readyState) {
      video.currentTime = time;
    } else {
      dispatch(videoProgress(time * 1000 + (currentRoute.videoStartOffset || 0)));
    }
    this.hls.startLoad(time);
    return true;
  }

  seekTo(offset) {
    const video = this.videoPlayer.current;
    // Safari ignores seeks before metadata, onLoadedMetadata seeks instead
    if (video.readyState) {
      video.currentTime = this.videoTime(offset);
    }
  }

  videoTime(offset) {
    return Math.max(0, (offset - (this.props.currentRoute.videoStartOffset || 0)) / 1000);
  }

  updatePlayback() {
    const { isPlaying, desiredPlaySpeed, dispatch } = this.props;
    const video = this.videoPlayer.current;
    video.playbackRate = desiredPlaySpeed;
    // loading a source resets playbackRate to defaultPlaybackRate
    video.defaultPlaybackRate = desiredPlaySpeed;
    if (!isPlaying) {
      // Chrome resumes a video it paused in a hidden tab, unless the page has called pause() on it too
      if (!video.paused) {
        video.pause();
      }
      return;
    }
    video.play().catch((err) => {
      if (err.name === 'NotAllowedError') {
        dispatch(pause());
      }
    });
  }

  loadSource = () => {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.videoPlayer.current;
    this.hls?.destroy();
    this.hls = null;
    this.missingFrag = null;
    this.setState(initialState);
    onAudioStatusChange?.(false);
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // iPhone before iOS 17.1 has neither, so play natively
    if (!window.MediaSource && !window.ManagedMediaSource) {
      video.audioTracks.onaddtrack = () => onAudioStatusChange?.(true);
      video.src = src;
      return;
    }

    const load = import('hls.js/light').then(({ default: Hls }) => {
      if (this.pendingHls !== load) {
        return;
      }
      this.hls = new Hls({
        maxBufferLength: 40,
        startPosition: this.videoTime(this.storedOffset()),
        workerPath: hlsWorker,
      });
      this.hls.on(Hls.Events.BUFFER_CODECS, (event, data) => onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
    }, () => this.setState({ videoError: errorMessage() }));
    this.pendingHls = load;
  };

  render() {
    const { isMuted } = this.props;
    const { buffering, videoError, noVideo } = this.state;
    const error = videoError || (noVideo && errorMessage(404));

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={buffering} error={error} onRetry={this.loadSource} />
        <video
          ref={this.videoPlayer}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          onLoadedMetadata={this.onLoadedMetadata}
          onTimeUpdate={this.onTimeUpdate}
          onWaiting={this.onWaiting}
          onSeeking={this.onTimeUpdate}
          onSeeked={this.updateBuffering}
          onCanPlay={this.updateBuffering}
          onPlaying={this.updateBuffering}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onRateChange={this.onRateChange}
          onEnded={this.onEnded}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  isPlaying: state.isPlaying,
  desiredPlaySpeed: state.desiredPlaySpeed,
  seekRequest: state.seekRequest,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
