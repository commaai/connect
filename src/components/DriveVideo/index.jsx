import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, Pause, PlayArrow } from '../../icons';
import { applyPendingSeek, currentOffset, seekTo, setVideo, setVideoFailed, setVideoSegments, toVideoTime } from '../../timeline';
import { pause, play, seek, videoState } from '../../timeline/playback';

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
  const visibleCls = error ? 'opacity-100' : 'opacity-100 delay-300 pointer-events-none';
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
      feedback: null,
    };
  }

  componentDidMount() {
    setVideo(this.video.current);
    this.video.current.audioTracks?.addEventListener('addtrack', this.onAddAudioTrack);
    this.load(this.props.zoom?.start ?? 0);
  }

  componentDidUpdate(prevProps) {
    const { zoom } = this.props;
    const previous = prevProps.zoom;
    if (zoom && (zoom.start !== previous?.start || zoom.end !== previous?.end)) {
      // leaving a range for a wider one keeps the playhead; a new range plays from its start
      const widened = previous && zoom.start <= previous.start && zoom.end >= previous.end;
      if (!widened) {
        seekTo(zoom.start);
        if (!this.state.error) {
          this.video.current.play().catch(() => {});
        }
      }
    }
  }

  componentWillUnmount() {
    this.loads += 1;
    const video = this.video.current;
    video.audioTracks?.removeEventListener('addtrack', this.onAddAudioTrack);
    video.cancelVideoFrameCallback?.(this.frameRequest);
    clearTimeout(this.tapTimer);
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
    setVideoFailed(false);
    setVideoSegments([]);
    onAudioStatusChange?.(false);
    // the video has no metadata now, so the clock holds this offset until it loads
    seekTo(startOffset);

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    // hls.js wherever Media Source is available (ManagedMediaSource on iOS 17.1+), native HLS elsewhere
    if (window.MediaSource || window.ManagedMediaSource) {
      // if hls.js can't be downloaded, native HLS gets the source and reports its own error
      const Hls = await import('hls.js/light').then((module) => module.default, () => null);
      if (load !== this.loads) {
        return;
      }
      if (Hls?.isSupported()) {
        this.hls = new Hls({ maxBufferLength: 40, startPosition: toVideoTime(currentOffset()) });
        this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
        this.hls.on(Hls.Events.LEVEL_LOADED, (_event, { details }) => setVideoSegments(
          details.fragments.map((frag) => ({ number: Number(frag.title), start: frag.start })),
        ));
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
    this.props.dispatch(videoState(this.video.current));
  };

  onLoadedMetadata = () => {
    applyPendingSeek();
    this.syncState();
  };

  // native HLS reports its audio as a track on the element; hls.js reports it through BUFFER_CODECS
  onAddAudioTrack = () => {
    if (!this.hls) {
      this.props.onAudioStatusChange?.(true);
    }
  };

  // a paused playhead may rest at the range end; playback past it loops
  loopAtRangeEnd() {
    const { zoom } = this.props;
    const video = this.video.current;
    if (!zoom || video.paused || currentOffset() < zoom.end) {
      return;
    }
    if (toVideoTime(zoom.end) > toVideoTime(zoom.start)) {
      seekTo(zoom.start);
    } else {
      // the range ends before the first camera frame or lies in a missing
      // segment, so it has no video to loop
      video.pause();
    }
  }

  onTimeUpdate = () => {
    this.loopAtRangeEnd();
    this.syncState();
  };

  // timeupdate only fires every ~250 ms, so while frames are shown the range end
  // is also checked on each frame; it is re-armed whenever playback starts so a
  // new source can't leave it unarmed
  onPlaying = () => {
    const video = this.video.current;
    if (video.requestVideoFrameCallback) {
      video.cancelVideoFrameCallback(this.frameRequest);
      this.frameRequest = video.requestVideoFrameCallback(this.onVideoFrame);
    }
    this.syncState();
  };

  onVideoFrame = () => {
    this.loopAtRangeEnd();
    this.frameRequest = this.video.current.requestVideoFrameCallback(this.onVideoFrame);
  };

  onEnded = () => {
    // the selected range runs past the end of the video, so it loops from its
    // start; a range that starts past the end has no video and stays paused
    const video = this.video.current;
    const start = this.props.zoom?.start ?? 0;
    if (toVideoTime(start) < video.duration) {
      seekTo(start);
      video.play().catch(() => {});
    }
  };

  onSeeking = () => {
    const video = this.video.current;
    const start = this.props.zoom?.start ?? 0;
    if (video.currentTime === 0 && toVideoTime(start) > 0) {
      // play() on a video that has ended rewinds it to 0, before the selected range
      seekTo(start);
    } else if (this.state.error && this.hls) {
      // seeking away from a segment that failed to load resumes loading there
      this.setState({ error: null });
      setVideoFailed(false);
      this.hls.startLoad(video.currentTime);
    }
    this.syncState();
  };

  // a failed video stays paused until it is retried, or a seek moves hls.js
  // away from the segment that failed. Meanwhile the timeline's clock moves the
  // playhead, so the map still plays
  fail(error) {
    this.setState({ error });
    this.video.current.pause();
    setVideoFailed(true);
    this.syncState();
  }

  onPlay = () => {
    if (this.state.error) {
      this.video.current.pause();
    }
    this.syncState();
  };

  // a tap plays or pauses. On touch, a double tap on either side jumps 10 s,
  // so a single tap waits to see if a second one follows. For a second after
  // a jump, taps only jump, so one tap too many doesn't pause
  onVideoPointerDown = (ev) => {
    this.tapPointer = ev.pointerType;
  };

  onVideoClick = (ev) => {
    const box = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - box.left) / box.width;
    const side = (x < 0.4 && -1) || (x > 0.6 && 1) || 0;
    const now = performance.now();
    const last = this.lastTap;
    const jumping = last?.jumps > 0 && now - last.time < 1000;
    clearTimeout(this.tapTimer);
    if (this.tapPointer !== 'touch') {
      this.togglePlay();
    } else if (side && (jumping || (last?.side === side && now - last.time < 300))) {
      const jumps = last.side === side ? last.jumps + 1 : 1;
      this.lastTap = { side, time: now, jumps };
      this.props.dispatch(seek(currentOffset() + (side * 10000)));
      this.setState({ feedback: { id: now, side, seconds: jumps * 10 } });
      return;
    } else if (jumping) {
      return;
    } else {
      this.tapTimer = setTimeout(this.togglePlay, 300);
    }
    this.lastTap = { side, time: now, jumps: 0 };
  };

  togglePlay = () => {
    const video = this.video.current;
    this.props.dispatch(video.paused ? play() : pause());
    this.setState({ feedback: { id: performance.now(), paused: video.paused } });
  };

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
      // recovery reattaches the element, which pauses it and drops its metadata
      const video = this.video.current;
      const offset = currentOffset();
      const playing = !video.paused;
      this.hls.recoverMediaError();
      seekTo(offset);
      if (playing) {
        video.play().catch(() => {});
      }
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
    const { error, feedback } = this.state;

    return (
      <>
        {feedback && (
          <div
            key={feedback.id}
            className={`absolute inset-0 z-40 flex items-center pointer-events-none text-white ${feedback.side ? 'animate-flash' : 'animate-fadeout'}`}
            onAnimationEnd={() => this.setState({ feedback: null })}
          >
            {feedback.side ? (
              <div className={`h-full w-2/5 grid place-items-center bg-white/15 text-lg font-semibold ${feedback.side < 0 ? 'rounded-r-[50%]' : 'ml-auto rounded-l-[50%]'}`}>
                {`${feedback.side < 0 ? '−' : '+'}${feedback.seconds} s`}
              </div>
            ) : (
              <div className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-black/50">
                {feedback.paused ? <Pause className="w-9 h-9" /> : <PlayArrow className="w-9 h-9" />}
              </div>
            )}
          </div>
        )}
        <VideoOverlay loading={isBufferingVideo} error={error} onRetry={() => this.load(currentOffset())} />
        {/* the box has the camera's shape, so the video fills it. To fit it instead,
            iOS first draws the video as if it were 2:1, the size before its metadata */}
        <video
          ref={this.video}
          className="w-full h-full object-fill cursor-pointer touch-manipulation"
          playsInline
          onPointerDown={this.onVideoPointerDown}
          onClick={this.onVideoClick}
          muted={isMuted}
          onLoadStart={this.syncState}
          onLoadedMetadata={this.onLoadedMetadata}
          onLoadedData={this.syncState}
          onCanPlay={this.syncState}
          onPlay={this.onPlay}
          onPlaying={this.onPlaying}
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
  <div className="relative max-w-[964px] m-[0_auto] aspect-[1.593]">
    {props.currentRoute && <RouteVideo key={props.currentRoute.fullname} {...props} />}
  </div>
);

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  isBufferingVideo: state.isBufferingVideo,
});

export default connect(stateToProps)(DriveVideo);
