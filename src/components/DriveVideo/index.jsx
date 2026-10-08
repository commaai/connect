import { Component, useState } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { clampToLoop, setPlaybackVideo } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';

const VideoOverlay = ({ loading, error, onRetry }) => (
  <div
    className={`z-50 absolute inset-0 flex flex-col items-center justify-center gap-3 text-center bg-[#16181AAA] transition-opacity duration-200
      ${error || loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}
      ${loading && !error ? 'delay-300' : ''}`}
  >
    {error ? (
      <>
        <ErrorOutline />
        <Typography>{error}</Typography>
        <button type="button" onClick={onRetry} className="cursor-pointer h-9 rounded-full bg-white px-4 text-sm font-semibold text-[#16181a]">
          Retry
        </button>
      </>
    ) : (
      <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
    )}
  </div>
);

class RouteVideo extends Component {
  constructor(props) {
    super(props);
    this.video = null;
    this.audioBound = false;
    this.recoveredMediaError = false;
    this.hlsOptions = {
      maxBufferLength: 40,
      startPosition: this.toVideoTime(this.requestedOffset()),
    };
    this.state = { waiting: true, error: null };
  }

  componentDidMount() {
    this.frame = requestAnimationFrame(this.wrapLoop);
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, loop } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.seekTo(seekRequest.offset);
      if (this.state.error) {
        this.props.onRetry();
      }
    } else if (this.video && loop !== prevProps.loop) {
      const offset = this.videoOffset();
      if (clampToLoop(offset, loop) !== offset) {
        this.seekTo(offset);
      }
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frame);
    if (this.video) {
      setPlaybackVideo(null);
    }
  }

  requestedOffset() {
    const { offset, loop } = this.props;
    return clampToLoop(offset ?? loop?.startTime ?? 0, loop);
  }

  toVideoTime(offset) {
    const { currentRoute } = this.props;
    return Math.max(0, (offset - (currentRoute.videoStartOffset || 0)) / 1000);
  }

  videoOffset() {
    const { currentRoute } = this.props;
    return this.video.currentTime * 1000 + (currentRoute.videoStartOffset || 0);
  }

  seekTo(offset) {
    if (this.video) {
      this.video.currentTime = this.toVideoTime(clampToLoop(offset, this.props.loop));
    }
  }

  // timeupdate is too coarse to end a short loop on time
  wrapLoop = () => {
    this.frame = requestAnimationFrame(this.wrapLoop);
    const { loop } = this.props;
    if (!this.video || !loop || this.video.paused || this.video.seeking) {
      return;
    }
    const loopEnd = loop.startTime + loop.duration;
    if (this.videoOffset() >= loopEnd && this.toVideoTime(loopEnd) > 0) {
      this.seekTo(loop.startTime);
    }
  };

  onLoadedMetadata = (ev) => {
    if (this.video) {
      return;
    }
    this.video = ev.target;
    this.seekTo(this.requestedOffset());
    setPlaybackVideo(this.video);
  };

  onReady = (player) => {
    if (this.audioBound) {
      return;
    }
    this.audioBound = true;
    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) {
      return;
    }
    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => onAudioStatusChange(Boolean(data.audio)));
    } else {
      const video = player.getInternalPlayer();
      onAudioStatusChange(Boolean(video?.audioTracks?.length));
    }
  };

  onWaiting = () => this.setState({ waiting: true });

  onPlayable = () => this.setState({ waiting: false });

  onTimeUpdate = (ev) => {
    const video = ev.target;
    if (this.state.waiting && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      this.setState({ waiting: false });
    }
  };

  onPlay = () => {
    this.onPlayable();
    if (!this.props.isPlaying) {
      this.props.dispatch(play());
    }
  };

  onPause = () => {
    if (this.props.isPlaying && !this.video?.ended) {
      this.props.dispatch(pause());
    }
  };

  onEnded = () => {
    const { isPlaying, loop } = this.props;
    if (isPlaying && loop) {
      this.seekTo(loop.startTime);
      this.video.play().catch(this.onError);
    } else {
      this.props.dispatch(pause());
    }
  };

  onError = (e, data, hls) => {
    if (e === 'hlsError') {
      if (!data?.fatal) {
        return;
      }
      if (data.type === 'mediaError' && !this.recoveredMediaError) {
        this.recoveredMediaError = true;
        hls?.recoverMediaError();
        return;
      }
      const error = data.response?.code === 404
        ? 'This video segment has not uploaded yet or has been deleted.'
        : data.type === 'networkError'
          ? 'Unable to load video. Check network connection.'
          : 'Unable to load video';
      this.setState({ error, waiting: false });
      return;
    }

    if (e?.name === 'AbortError') {
      return;
    }
    if (e?.name === 'NotAllowedError') {
      this.props.dispatch(pause());
      return;
    }

    const mediaError = e?.target?.error;
    const error = mediaError && mediaError.code === mediaError.MEDIA_ERR_NETWORK
      ? 'Unable to load video. Check network connection.'
      : 'Unable to load video';
    this.setState({ error, waiting: false });
  };

  render() {
    const { currentRoute, desiredPlaySpeed, isPlaying, isMuted, dispatch } = this.props;
    const { waiting, error } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={waiting && isPlaying}
          error={error}
          onRetry={() => dispatch(seek(this.video ? this.videoOffset() : this.requestedOffset()))}
        />
        <ReactPlayer
          url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={isPlaying}
          playbackRate={desiredPlaySpeed}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: this.hlsOptions,
            attributes: {
              onLoadedMetadata: this.onLoadedMetadata,
              onSeeking: this.onWaiting,
              onSeeked: this.onPlayable,
              onCanPlay: this.onPlayable,
              onTimeUpdate: this.onTimeUpdate,
            },
          }}
          onReady={this.onReady}
          onBuffer={this.onWaiting}
          onBufferEnd={this.onPlayable}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onEnded={this.onEnded}
          onError={this.onError}
        />
      </div>
    );
  }
}

function DriveVideo(props) {
  const [attempt, setAttempt] = useState(0);
  if (!props.currentRoute) {
    return null;
  }
  return (
    <RouteVideo
      {...props}
      key={`${props.currentRoute.fullname}-${attempt}`}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isPlaying: state.isPlaying,
  offset: state.offset,
  seekRequest: state.seekRequest,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
