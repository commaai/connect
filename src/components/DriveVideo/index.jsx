import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { applyPendingSeek, currentOffset, seekTo, setVideo, toVideoTime } from '../../timeline';
import { videoState } from '../../timeline/playback';

const NOT_UPLOADED_ERROR = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const LOAD_ERROR = 'Unable to load video';

// The spinner fades in after a short delay so seeks within the buffer don't flash it.
const VideoOverlay = ({ loading, error, onRetry }) => {
  let content = null;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <button type="button" onClick={onRetry} className="mt-4 cursor-pointer h-9 rounded-full bg-white px-5 font-semibold text-[#16181a]">
          Try again
        </button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  }
  const visibleCls = error ? 'opacity-100' : 'opacity-100 delay-300';
  return (
    <div className={`z-50 absolute h-full w-full flex flex-col items-center justify-center text-center bg-[#16181AAA] transition-opacity ${content ? visibleCls : 'opacity-0 pointer-events-none'}`}>
      {content}
    </div>
  );
};

class RouteVideo extends Component {
  constructor(props) {
    super(props);

    this.video = React.createRef();
    this.hls = null;
    this.loads = 0;

    this.state = {
      error: null,
    };
  }

  componentDidMount() {
    setVideo(this.video.current);
    this.load(this.props.zoom?.start ?? 0);
  }

  componentDidUpdate(prevProps) {
    const { zoom } = this.props;
    if (zoom && (zoom.start !== prevProps.zoom?.start || zoom.end !== prevProps.zoom?.end)) {
      // a new range plays from its start
      seekTo(zoom.start);
      if (!this.state.error) {
        this.video.current.play().catch(() => {});
      }
    }
  }

  componentWillUnmount() {
    this.loads += 1;
    this.unload();
    setVideo(null);
  }

  unload() {
    const video = this.video.current;
    this.hls?.destroy();
    this.hls = null;
    video.removeAttribute('src');
    video.load();
  }

  async load(startOffset) {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.video.current;
    this.loads += 1;
    const load = this.loads;

    this.unload();
    this.mediaErrorRecovered = false;
    this.setState({ error: null });
    onAudioStatusChange?.(false);
    // the video has no metadata now, so the clock holds this offset until it loads
    seekTo(startOffset);

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // hls.js wherever Media Source is available (ManagedMediaSource on iOS 17.1+), native HLS elsewhere
    if (window.MediaSource || window.ManagedMediaSource) {
      const { default: Hls } = await import('hls.js/light');
      if (load !== this.loads) {
        return;
      }
      if (Hls.isSupported()) {
        this.hls = new Hls({ maxBufferLength: 40, startPosition: toVideoTime(currentOffset()) });
        this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
        this.hls.on(Hls.Events.ERROR, this.onHlsError);
        this.hls.loadSource(src);
        this.hls.attachMedia(video);
      }
    }
    if (!this.hls) {
      video.src = src;
    }
    // a refused play() leaves the video paused, which the controls show
    video.play().catch(() => {});
  }

  syncState = () => {
    const { dispatch, isPaused, playSpeed, isBufferingVideo } = this.props;
    const action = videoState(this.video.current);
    if (action.isPaused !== isPaused || action.playSpeed !== playSpeed || action.isBufferingVideo !== isBufferingVideo) {
      dispatch(action);
    }
  };

  onLoadedMetadata = () => {
    applyPendingSeek();
    if (!this.hls) {
      this.props.onAudioStatusChange?.(Boolean(this.video.current.audioTracks?.length));
    }
    this.syncState();
  };

  onTimeUpdate = () => {
    const { zoom } = this.props;
    if (zoom && currentOffset() >= zoom.end) {
      seekTo(zoom.start);
    }
    this.syncState();
  };

  onEnded = () => {
    // the selected range runs past the end of the video
    const video = this.video.current;
    const start = this.props.zoom?.start ?? 0;
    if (toVideoTime(start) < video.duration) {
      seekTo(start);
      video.play().catch(() => {});
    }
  };

  onSeeking = () => {
    // seeking away from a segment that failed to load resumes loading there
    if (this.state.error && this.hls) {
      this.setState({ error: null });
      this.hls.startLoad(this.video.current.currentTime);
    }
    this.syncState();
  };

  // a video that failed is not playing, so the controls offer play again
  fail(error) {
    this.setState({ error });
    this.video.current.pause();
  }

  onError = () => {
    const { error } = this.video.current;
    // hls.js reports its own errors with more detail
    if (this.hls || !error || error.code === MediaError.MEDIA_ERR_ABORTED) {
      return;
    }
    this.fail(error.code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : LOAD_ERROR);
  };

  onHlsError = (_event, data) => {
    if (!data.fatal) {
      return; // hls.js retries these itself
    }
    if (data.type === 'mediaError' && !this.mediaErrorRecovered) {
      this.mediaErrorRecovered = true;
      this.hls.recoverMediaError();
      return;
    }
    if (data.response?.code === 404) {
      this.fail(NOT_UPLOADED_ERROR);
    } else {
      this.fail(data.type === 'networkError' ? NETWORK_ERROR : LOAD_ERROR);
    }
  };

  render() {
    const { isMuted, isBufferingVideo } = this.props;
    const { error } = this.state;

    return (
      <>
        <VideoOverlay loading={isBufferingVideo} error={error} onRetry={() => this.load(currentOffset())} />
        <video
          ref={this.video}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          onLoadStart={this.syncState}
          onLoadedMetadata={this.onLoadedMetadata}
          onLoadedData={this.syncState}
          onCanPlay={this.syncState}
          onPlay={this.syncState}
          onPlaying={this.syncState}
          onPause={this.syncState}
          onWaiting={this.syncState}
          onSeeking={this.onSeeking}
          onSeeked={this.syncState}
          onRateChange={this.syncState}
          onEmptied={this.syncState}
          onTimeUpdate={this.onTimeUpdate}
          onEnded={this.onEnded}
          onError={this.onError}
        />
      </>
    );
  }
}

// a new route gets a new video element
const DriveVideo = (props) => (
  <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
    {props.currentRoute && <RouteVideo key={props.currentRoute.fullname} {...props} />}
  </div>
);

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  isPaused: state.isPaused,
  playSpeed: state.playSpeed,
  isBufferingVideo: state.isBufferingVideo,
});

export default connect(stateToProps)(DriveVideo);
