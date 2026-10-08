import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, PlayArrow, Refresh } from '../../icons';
import { attachVideo, currentOffset, seekVideo, wrapLoop } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';

const overlayClass = 'z-50 absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#16181AAA] animate-fadein';

const VideoOverlay = ({ loading, blocked, error, onPlay, onRetry }) => {
  if (error) {
    return (
      <div className={overlayClass}>
        <ErrorOutline />
        <Typography>{error}</Typography>
        <Button variant="outlined" size="small" onClick={onRetry}>
          <Refresh className="mr-1" style={{ fontSize: 18 }} />
          Retry
        </Button>
      </div>
    );
  }
  if (blocked) {
    return (
      <button type="button" className={`${overlayClass} cursor-pointer text-white`} onClick={onPlay} aria-label="Play">
        <PlayArrow className="rounded-full bg-[#16181A99] p-3" style={{ fontSize: 72 }} />
      </button>
    );
  }
  if (loading) {
    // short stalls resolve before the delay, so the spinner doesn't flash
    return (
      <div className={`${overlayClass} [animation-delay:400ms] [animation-fill-mode:backwards]`}>
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
      </div>
    );
  }
  return null;
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onReady = this.onReady.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onBuffer = this.onBuffer.bind(this);
    this.onBufferEnd = this.onBufferEnd.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onError = this.onError.bind(this);
    this.onFrame = this.onFrame.bind(this);
    this.playVideo = this.playVideo.bind(this);
    this.retry = this.retry.bind(this);

    this.videoPlayer = React.createRef();
    this.recoveryAttempted = false;

    this.state = {
      attempt: 0,
      ready: false,
      waiting: false,
      autoplayBlocked: false,
      error: null,
    };
  }

  componentDidMount() {
    this.frame = requestAnimationFrame(this.onFrame);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      // keep the same element, iOS remembers that the user allowed it to play with sound
      attachVideo(null);
      this.recoveryAttempted = false;
      this.props.onAudioStatusChange?.(false);
      this.setState({ ready: false, waiting: false, autoplayBlocked: false, error: null });
    } else if (this.state.error && prevProps.offset !== this.props.offset) {
      // seeking away from a broken spot is the quickest way out of an error
      this.retry();
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frame);
    attachVideo(null);
  }

  onLoadedMetadata(e) {
    const video = e.currentTarget;
    attachVideo(video);
    this.setState({ ready: true });

    // hls.js hides the audio track from the element, onReady asks it instead
    if (video.audioTracks?.length > 0) {
      this.props.onAudioStatusChange?.(true);
    }

    // ReactPlayer only plays once it can, which iOS may never reach without a user gesture
    if (this.props.desiredPlaySpeed && video.paused) {
      this.playVideo();
    }
  }

  onTimeUpdate(e) {
    const video = e.currentTarget;
    if (!video.paused && video.readyState >= 3) {
      // iOS can report waiting without a matching playing event
      this.recoveryAttempted = false;
      this.onBufferEnd();
    }
    // animation frames stop in background tabs, timeupdate doesn't
    wrapLoop();
  }

  onReady() {
    const hls = this.videoPlayer.current.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (event, data) => this.props.onAudioStatusChange?.(Boolean(data.audio)));
    }
  }

  onPlay() {
    const { desiredPlaySpeed, dispatch } = this.props;
    this.setState({ autoplayBlocked: false });
    if (!desiredPlaySpeed) {
      dispatch(play(this.videoPlayer.current.getInternalPlayer().playbackRate));
    }
  }

  onPause() {
    const { desiredPlaySpeed, dispatch } = this.props;
    this.setState({ waiting: false });
    if (desiredPlaySpeed && !this.videoPlayer.current.getInternalPlayer().ended) {
      dispatch(pause());
    }
  }

  onBuffer() {
    this.setState({ waiting: true });
  }

  onBufferEnd() {
    if (this.state.waiting || this.state.error) {
      this.setState({ waiting: false, error: null });
    }
  }

  onEnded() {
    // the video can end before the loop does, start over from the loop start
    seekVideo(0);
    if (this.props.desiredPlaySpeed) {
      this.playVideo();
    }
  }

  onError(e, data) {
    if (e?.name === 'AbortError') {
      // play() was interrupted by a pause or a new source
      return;
    }
    if (e?.name === 'NotAllowedError') {
      this.props.dispatch(pause());
      this.setState({ autoplayBlocked: true });
      return;
    }

    const hls = this.videoPlayer.current?.getInternalPlayer('hls');
    const missing = data?.response?.code === 404;
    if (hls && missing && data.frag) {
      // a segment that never uploaded won't show up on retry, play on from the next one
      const video = this.videoPlayer.current.getInternalPlayer();
      video.currentTime = data.frag.start + data.frag.duration;
      hls.startLoad(video.currentTime);
      return;
    }
    if (e === 'hlsError' && !data.fatal) {
      return;
    }
    if (!missing && !this.recoveryAttempted) {
      this.recoveryAttempted = true;
      if (hls && data?.type === 'networkError') {
        hls.startLoad();
      } else {
        this.retry();
      }
      return;
    }

    console.error('Video error', { e, data });
    this.setState({
      waiting: false,
      error: missing ? 'This video segment has not uploaded yet or has been deleted.' : 'Unable to load video',
    });
  }

  onFrame() {
    wrapLoop();
    this.frame = requestAnimationFrame(this.onFrame);
  }

  playVideo() {
    // called straight from user gestures, iOS won't start playback otherwise
    this.videoPlayer.current.getInternalPlayer().play()?.catch(this.onError);
    if (!this.props.desiredPlaySpeed) {
      this.props.dispatch(play());
    }
  }

  // reload the stream where it left off
  retry() {
    const offset = currentOffset();
    attachVideo(null);
    this.props.dispatch(seek(offset));
    this.setState(({ attempt }) => ({ attempt: attempt + 1, ready: false, waiting: false, error: null }));
  }

  render() {
    const { desiredPlaySpeed, currentRoute, isMuted } = this.props;
    const { attempt, ready, waiting, autoplayBlocked, error } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={!ready || waiting}
          blocked={autoplayBlocked}
          error={error}
          onPlay={this.playVideo}
          onRetry={this.retry}
        />
        {currentRoute && (
          <ReactPlayer
            key={attempt}
            ref={this.videoPlayer}
            url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
            playsinline
            muted={isMuted}
            width="100%"
            height="100%"
            playing={Boolean(desiredPlaySpeed)}
            playbackRate={desiredPlaySpeed || 1}
            config={{
              hlsVersion: '1.4.8',
              hlsOptions: {
                maxBufferLength: 40,
              },
              attributes: {
                onLoadedMetadata: this.onLoadedMetadata,
                onTimeUpdate: this.onTimeUpdate,
              },
            }}
            onReady={this.onReady}
            onPlay={this.onPlay}
            onPause={this.onPause}
            onBuffer={this.onBuffer}
            onBufferEnd={this.onBufferEnd}
            onEnded={this.onEnded}
            onError={this.onError}
          />
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
