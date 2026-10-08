import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { attachVideo, currentOffset, detachVideo, seekVideo } from '../../timeline';
import { pause, play, seek } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const NOT_UPLOADED = 'This video segment has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const UNPLAYABLE = 'Unable to load video';

// iOS plays HLS natively; everywhere else hls.js plays it through Media Source Extensions
async function loadHls() {
  if (isIos()) {
    return null;
  }
  const { default: Hls } = await import('hls.js');
  return Hls.isSupported() ? Hls : null;
}

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        {onRetry && <Button className="mt-2" variant="outlined" onClick={onRetry}>Retry</Button>}
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

// A plain <video> playing the current drive. It is the playback clock: controls
// are applied to it, and its own events, including native and OS media
// controls, are what change playback state.
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.video = React.createRef();
    this.hls = null;
    this.loads = 0;
    this.recoveredMediaError = false;

    this.state = {
      loading: true,
      error: null, // { message, retryable }
    };

    this.retry = this.retry.bind(this);
    this.onLoading = this.onLoading.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
  }

  componentDidMount() {
    attachVideo(this.video.current);
    this.load();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.load();
    }
    if (prevProps.desiredPlaySpeed !== this.props.desiredPlaySpeed) {
      this.applyPlaySpeed();
    }
  }

  componentWillUnmount() {
    this.loads += 1;
    this.unload();
    detachVideo(this.video.current);
  }

  async load() {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.video.current;
    this.loads += 1;
    const load = this.loads;
    this.unload();
    this.setState({ loading: true, error: null });
    if (!currentRoute) {
      return;
    }

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    let Hls;
    try {
      Hls = await loadHls();
    } catch (err) {
      console.error('Failed to load hls.js', err);
      this.setState({ error: { message: NETWORK_ERROR, retryable: true } });
      return;
    }
    if (load !== this.loads) {
      return; // superseded while hls.js was loading
    }
    if (!Hls) {
      video.src = src;
      return;
    }
    this.hls = new Hls({ maxBufferLength: 40 });
    this.hls.on(Hls.Events.ERROR, this.onHlsError);
    this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
    this.hls.loadSource(src);
    this.hls.attachMedia(video);
  }

  unload() {
    const video = this.video.current;
    this.hls?.destroy();
    this.hls = null;
    this.recoveredMediaError = false;
    if (video.getAttribute('src')) {
      video.removeAttribute('src');
      video.load();
    }
  }

  retry() {
    this.props.dispatch(seek(currentOffset())); // resume where it failed
    this.load();
  }

  applyPlaySpeed() {
    const { desiredPlaySpeed, dispatch } = this.props;
    const video = this.video.current;
    if (!desiredPlaySpeed) {
      video.pause();
      return;
    }
    // loading a new source resets playbackRate to defaultPlaybackRate
    video.defaultPlaybackRate = desiredPlaySpeed;
    video.playbackRate = desiredPlaySpeed;
    video.play()?.catch((err) => {
      if (err.name === 'NotAllowedError') {
        dispatch(pause()); // autoplay was blocked: show the play button instead
      }
    });
  }

  onLoading() {
    const video = this.video.current;
    this.setState({ loading: video.seeking || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA });
  }

  // start from the requested position, then play if playing
  onLoadedMetadata() {
    const { offset, loop, onAudioStatusChange } = this.props;
    seekVideo(offset ?? loop?.startTime ?? 0);
    this.applyPlaySpeed();
    if (isIos()) {
      onAudioStatusChange?.(this.video.current.audioTracks?.length > 0);
    }
  }

  // keep playback inside the selected range
  onTimeUpdate() {
    const { loop, dispatch } = this.props;
    if (loop && currentOffset() >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }
  }

  onEnded() {
    const { loop, desiredPlaySpeed, dispatch } = this.props;
    if (desiredPlaySpeed) {
      dispatch(seek(loop?.startTime ?? 0));
      this.applyPlaySpeed();
    }
  }

  // play and pause from outside the app: native fullscreen, lock screen, headphones
  onPlay() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (!desiredPlaySpeed) {
      dispatch(play(this.video.current.playbackRate));
    }
  }

  onPause() {
    const { desiredPlaySpeed, dispatch } = this.props;
    const video = this.video.current;
    if (desiredPlaySpeed && !video.ended && video.readyState > HTMLMediaElement.HAVE_NOTHING) {
      dispatch(pause());
    }
  }

  onVideoError() {
    const { error } = this.video.current;
    if (this.hls || !error) {
      return; // hls.js reports its own errors
    }
    const message = error.code === MediaError.MEDIA_ERR_NETWORK ? NETWORK_ERROR : UNPLAYABLE;
    this.setState({ error: { message, retryable: true } });
  }

  onHlsError(_event, data) {
    if (!data.fatal) {
      return; // hls.js recovers from these by itself
    }
    if (data.type === 'mediaError' && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.hls.recoverMediaError();
    } else if (data.response?.code === 404) {
      this.setState({ error: { message: NOT_UPLOADED, retryable: false } });
    } else if (data.type === 'networkError') {
      this.setState({ error: { message: NETWORK_ERROR, retryable: true } });
    } else {
      this.setState({ error: { message: UNPLAYABLE, retryable: true } });
    }
  }

  render() {
    const { isMuted } = this.props;
    const { loading, error } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={loading} error={error?.message} onRetry={error?.retryable ? this.retry : null} />
        <video
          ref={this.video}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          onLoadedMetadata={this.onLoadedMetadata}
          onTimeUpdate={this.onTimeUpdate}
          onEnded={this.onEnded}
          onPlay={this.onPlay}
          onPause={this.onPause}
          onError={this.onVideoError}
          onLoadStart={this.onLoading}
          onLoadedData={this.onLoading}
          onWaiting={this.onLoading}
          onSeeking={this.onLoading}
          onSeeked={this.onLoading}
          onCanPlay={this.onLoading}
          onPlaying={this.onLoading}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
