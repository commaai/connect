/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
// the ESM build of hls.js can't inline its transmuxing worker
import hlsWorker from 'hls.js/dist/hls.worker.js?url';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, RefreshIcon } from '../../icons';
import { pause, play, setPlaybackSpeed, videoProgress } from '../../timeline/playback';

let hlsModule = null;
// a failed chunk fetch is cached, so only a page reload retries it
let hlsFailed = false;
function loadHls() {
  if (!hlsModule) {
    hlsModule = import('hls.js/light');
    hlsModule.catch(() => { hlsFailed = true; });
  }
  return hlsModule;
}

const VideoOverlay = ({ loading, stuck, error, onRetry }) => {
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
        {(error || stuck) && (
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

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.tick = this.tick.bind(this);
    this.reload = this.reload.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onRateChange = this.onRateChange.bind(this);
    this.onVolumeChange = this.onVolumeChange.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onOnline = this.onOnline.bind(this);
    this.updateBuffering = this.updateBuffering.bind(this);

    this.videoPlayer = React.createRef();
    this.hls = null;
    this.missingFrag = null;

    this.state = {
      buffering: true,
      stuck: false,
      videoError: null,
      noVideo: null,
    };
  }

  componentDidMount() {
    window.addEventListener('online', this.onOnline);
    this.frame = requestAnimationFrame(this.tick);
    this.loadSource();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, isPlaying, desiredPlaySpeed, seekRequest, loop } = this.props;
    if (currentRoute?.fullname !== prevProps.currentRoute?.fullname) {
      this.loadSource();
      return;
    }
    if ((currentRoute?.videoStartOffset || 0) !== (prevProps.currentRoute?.videoStartOffset || 0)) {
      // late route events moved the first frame
      this.seekTo(this.currentOffset());
    }
    if (seekRequest !== prevProps.seekRequest) {
      // can't seek a failed source
      if (this.state.videoError) {
        this.loadSource();
      } else {
        this.clearNoVideo();
        this.seekTo(seekRequest.offset);
        // hls.js may have stopped at a missing last segment, or still be loading the old start
        if (this.hls && (!this.hls.loadingEnabled || !this.videoPlayer.current.readyState)) {
          this.hls.startLoad(this.videoTime(seekRequest.offset));
        }
      }
    }
    if (loop !== prevProps.loop) {
      this.clearNoVideo();
      this.keepInLoop();
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

  // read from the store, mapping offset would re-render the video every frame
  currentOffset() {
    return this.props.dispatch((_, getState) => getState().offset);
  }

  onLoadedMetadata() {
    this.seekTo(this.currentOffset());
    this.updatePlayback();
  }

  onTimeUpdate() {
    this.updateBuffering();
    // animation frames stop in background tabs, timeupdate doesn't
    this.keepInLoop();
    this.reportProgress();
  }

  onWaiting() {
    this.updateBuffering();
    this.skipMissingFrag();
  }

  // media keys, headphones and iOS can play/pause the video directly
  onPlay() {
    const { isPlaying, dispatch } = this.props;
    const video = this.videoPlayer.current;
    if (!isPlaying && !video.paused) {
      dispatch(play());
    }
  }

  onPause() {
    const { isPlaying, dispatch } = this.props;
    const video = this.videoPlayer.current;
    if (isPlaying && video.paused && !video.ended) {
      dispatch(pause());
    }
    this.updateBuffering();
  }

  // the browser's menu and extensions can set the speed and mute too
  onRateChange() {
    const { desiredPlaySpeed, dispatch } = this.props;
    const { playbackRate } = this.videoPlayer.current;
    if (playbackRate > 0 && playbackRate !== desiredPlaySpeed) {
      dispatch(setPlaybackSpeed(playbackRate));
    }
  }

  onVolumeChange() {
    const { isMuted, onMuteChange } = this.props;
    const { muted } = this.videoPlayer.current;
    if (muted !== isMuted) {
      onMuteChange?.(muted);
    }
  }

  onEnded() {
    const { loop, dispatch } = this.props;
    if (loop && this.videoTime(loop.startTime) < this.videoPlayer.current.duration) {
      this.seekTo(loop.startTime);
      this.updatePlayback();
    } else {
      dispatch(pause(true));
    }
  }

  onVideoError() {
    const video = this.videoPlayer.current;
    if (!this.hls && video.error) {
      this.setState({ videoError: errorMessage() });
    }
  }

  onHlsError(event, data) {
    if (data.details === 'fragLoadError' && data.response?.code === 404) {
      this.missingFrag = data.frag;
      if (!this.skipMissingFrag() && data.fatal) {
        // hls.js stops loading after giving up on a fragment
        this.hls.startLoad(this.videoPlayer.current.currentTime);
      }
    } else if (data.fatal && data.type === 'mediaError' && !this.mediaRecovered) {
      // hls.js stops on a fatal media error, reattaching usually recovers
      this.mediaRecovered = true;
      this.hls.recoverMediaError();
    } else if (data.fatal) {
      this.setState({ videoError: errorMessage(data.response?.code) });
    }
  }

  onOnline() {
    // hls.js needs startLoad, native HLS needs a new src
    if (this.hls && !this.state.videoError) {
      this.hls.startLoad(this.videoPlayer.current.currentTime);
    } else {
      this.reload();
    }
  }

  // timeupdate is ~4 Hz, too slow for the timeline and for loop ends at 8x
  tick() {
    this.frame = requestAnimationFrame(this.tick);
    const video = this.videoPlayer.current;
    if (video.paused) {
      this.stallSince = null;
      return;
    }
    this.keepInLoop();
    this.reportProgress();
    if (!window.MediaSource) {
      this.watchStall(video);
    }
  }

  // native HLS can stall after a network error without firing an event
  watchStall(video) {
    const now = performance.now();
    // a stuck Safari can move currentTime back a few ms
    if (!this.stallSince || Math.abs(video.currentTime - this.stallTime) > 0.1) {
      this.stallTime = video.currentTime;
      this.stallSince = now;
    }
    const stuck = now - this.stallSince > 30000;
    if (stuck !== this.state.stuck) {
      this.setState({ stuck });
    }
    if (now - this.stallSince > 1000 && !this.state.buffering) {
      this.setState({ buffering: true });
    }
  }

  keepInLoop() {
    const { currentRoute, loop } = this.props;
    const video = this.videoPlayer.current;
    if (!loop || video.readyState === 0 || video.seeking) {
      return;
    }
    const videoStartOffset = currentRoute?.videoStartOffset || 0;
    const offset = video.currentTime * 1000 + videoStartOffset;
    // 1 ms of slack for float rounding after seeking to the loop start
    if (offset >= loop.startTime - 1 && offset <= loop.startTime + loop.duration) {
      return;
    }
    if (loop.startTime + loop.duration <= videoStartOffset
      || (video.ended && this.videoTime(loop.startTime) >= video.duration)) {
      this.showNoVideo();
      return;
    }
    this.seekTo(loop.startTime);
  }

  showNoVideo() {
    const { isPlaying, dispatch } = this.props;
    if (!this.state.noVideo) {
      this.setState({ noVideo: { resume: isPlaying } });
    }
    if (isPlaying) {
      dispatch(pause(true));
    }
  }

  clearNoVideo() {
    if (this.state.noVideo?.resume) {
      this.props.dispatch(play(true));
    }
    this.setState({ noVideo: null });
  }

  reportProgress() {
    const { currentRoute, dispatch } = this.props;
    const video = this.videoPlayer.current;
    if (video.readyState === 0 || video.seeking) {
      return;
    }
    const offset = this.currentOffset();
    const progress = Math.round(video.currentTime * 1000) + (currentRoute?.videoStartOffset || 0);
    if (progress !== offset) {
      dispatch(videoProgress(progress));
    }
  }

  updateBuffering() {
    const video = this.videoPlayer.current;
    const needed = video.paused ? video.HAVE_CURRENT_DATA : video.HAVE_FUTURE_DATA;
    const buffering = video.seeking || video.readyState < needed;
    if (buffering !== this.state.buffering) {
      this.setState({ buffering });
    }
  }

  skipMissingFrag() {
    const { currentRoute, loop, dispatch } = this.props;
    const video = this.videoPlayer.current;
    const frag = this.missingFrag;
    // before metadata the video sits at 0 on its way to the offset
    const position = video.readyState ? video.currentTime : this.videoTime(this.currentOffset());
    const stalled = video.readyState < video.HAVE_FUTURE_DATA;
    if (!frag || !stalled || position <= frag.start - 1 || position >= frag.end) {
      return false;
    }
    // past maxFragLookUpTolerance (0.25 s), or hls.js picks the same fragment
    const time = frag.end + 0.3;
    if (time >= video.duration || (loop && time > this.videoTime(loop.startTime + loop.duration))) {
      this.showNoVideo();
      return true;
    }
    // stopLoad drops the queued retry of the 404
    this.hls.stopLoad();
    if (video.readyState) {
      video.currentTime = time;
    } else {
      dispatch(videoProgress(time * 1000 + (currentRoute?.videoStartOffset || 0)));
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
    return Math.max(0, (offset - (this.props.currentRoute?.videoStartOffset || 0)) / 1000);
  }

  // loading a source resets playbackRate to defaultPlaybackRate
  updateSpeed() {
    const { desiredPlaySpeed } = this.props;
    const video = this.videoPlayer.current;
    video.playbackRate = desiredPlaySpeed;
    video.defaultPlaybackRate = desiredPlaySpeed;
  }

  updatePlayback() {
    const { isPlaying, dispatch } = this.props;
    const video = this.videoPlayer.current;
    this.updateSpeed();
    if (!isPlaying) {
      // pausing again stops Chrome resuming it when a hidden tab comes back
      if (!video.paused) {
        video.pause();
      }
      return;
    }
    video.play().catch((err) => {
      if (err.name === 'NotAllowedError') {
        dispatch(pause(true));
      }
    });
  }

  reload() {
    if (hlsFailed) {
      window.location.reload();
      return;
    }
    this.loadSource();
  }

  loadSource() {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.videoPlayer.current;
    this.updateSpeed();
    this.hls?.destroy();
    this.hls = null;
    this.pendingHls = null;
    this.missingFrag = null;
    this.mediaRecovered = false;
    this.setState({ buffering: true, stuck: false, videoError: null, noVideo: null });
    onAudioStatusChange?.(false);
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // iPhone has no MediaSource, so play natively (Hls.isSupported() accepts ManagedMediaSource)
    if (!window.MediaSource) {
      video.audioTracks.onaddtrack = () => onAudioStatusChange?.(true);
      video.src = src;
      return;
    }

    const load = loadHls().then(({ default: Hls }) => {
      if (this.pendingHls !== load) {
        return;
      }
      this.hls = new Hls({
        maxBufferLength: 40,
        startPosition: this.videoTime(this.currentOffset()),
        workerPath: hlsWorker,
        ...api.video.getHlsOptions?.(currentRoute, Hls),
      });
      this.hls.on(Hls.Events.BUFFER_CODECS, (event, data) => onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
    }, () => this.setState({ videoError: errorMessage() }));
    this.pendingHls = load;
  }

  render() {
    const { isMuted } = this.props;
    const { buffering, stuck, videoError, noVideo } = this.state;
    const error = videoError || (noVideo && errorMessage(404));

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={buffering} stuck={stuck} error={error} onRetry={this.reload} />
        <video
          ref={this.videoPlayer}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          onLoadedMetadata={this.onLoadedMetadata}
          onTimeUpdate={this.onTimeUpdate}
          onWaiting={this.onWaiting}
          onSeeking={this.updateBuffering}
          onSeeked={this.updateBuffering}
          onCanPlay={this.updateBuffering}
          onPlaying={this.updateBuffering}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onRateChange={this.onRateChange}
          onVolumeChange={this.onVolumeChange}
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
