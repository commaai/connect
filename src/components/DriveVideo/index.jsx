/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, videoTick, bufferVideo, pause } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

// Commanded-vs-player tolerance: below this the player is "there" and we
// leave it alone; above it a user seek (or loop wrap) moves the player.
// (The old code continuously nudged playbackRate to chase the wall clock;
// that caused the iOS/Bluetooth audio crackle. The video is the clock now.)
const SEEK_TOLERANCE_S = 0.35;

// iOS stalls above 2x in its built-in player; firefox mutes above 8x.
function clampSpeed(speed, isMuted) {
  const cap = isIos() ? 2 : 16;
  return Math.max(0, Math.min(cap, speed));
}

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        {onRetry && (
          <Button variant="outlined" onClick={onRetry} style={{ color: Colors.white, marginTop: 12 }}>
            Retry video
          </Button>
        )}
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

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onProgress = this.onProgress.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onRetry = this.onRetry.bind(this);
    this.seekPlayerToOffset = this.seekPlayerToOffset.bind(this);

    this.videoPlayer = React.createRef();
    this.sourceAdjusted = false;

    this.state = {
      src: null,
      videoError: null,
      playerKey: 0,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncSeek();
  }

  onVideoBuffering() {
    const { dispatch, currentRoute } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !currentRoute || !videoPlayer.getDuration()) {
      dispatch(bufferVideo(true));
      return;
    }

    let internal;
    try {
      internal = videoPlayer.getInternalPlayer();
    } catch {
      dispatch(bufferVideo(true));
      return;
    }
    if (!internal || internal.readyState < 2) {
      dispatch(bufferVideo(true));
    }
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // buffer but no error
      return;
    }

    if (e.type === 'networkError' && (e.response?.code === 404)) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
  }

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }

    if (e.name === 'AbortError') {
      // ignore
      return;
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // Sometimes an error will be thrown because we try to play
      // src: \"https://connect.comma.ai/.../undefined\"
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }

    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
    this.setState({ videoError });
  }

  onVideoResume() {
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
  }

  onRetry() {
    // Remount the player (fresh media element + HLS loader) at the frozen
    // timeline position, preserving play/pause and speed selection.
    this.sourceAdjusted = false;
    this.setState((state) => ({ videoError: null, playerKey: state.playerKey + 1 }));
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.sourceAdjusted = false;
      this.setState({ src, videoError: null });
    }
  }

  routeOffsetFromVideo(videoSeconds) {
    const { currentRoute } = this.props;
    let offset = Math.max(0, videoSeconds) * 1000;
    if (currentRoute?.videoStartOffset) {
      offset += currentRoute.videoStartOffset;
    }
    return offset;
  }

  currentVideoTime(offset = currentOffset()) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      return 0;
    }

    if (currentRoute.videoStartOffset) {
      offset -= currentRoute.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  seekPlayerToOffset(offset) {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer) return;
    try {
      videoPlayer.seekTo(this.currentVideoTime(offset), 'seconds');
    } catch (err) {
      console.debug('[DriveVideo] seek interrupted', err);
    }
  }

  // One-directional correction: if the commanded timeline offset disagrees
  // with the player (user seek, loop wrap, route change), move the player.
  // Player progress flows back via onProgress -> videoTick. No rate nudging.
  syncSeek() {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer || !this.props.currentRoute) {
      return;
    }
    let curVideoTime;
    try {
      if (!videoPlayer.getDuration()) return;
      curVideoTime = videoPlayer.getCurrentTime();
    } catch {
      return;
    }
    const desiredVideoTime = this.currentVideoTime();
    if (Math.abs(desiredVideoTime - curVideoTime) > SEEK_TOLERANCE_S) {
      this.seekPlayerToOffset(currentOffset());
    }
  }

  onProgress({ playedSeconds }) {
    const { dispatch, currentRoute, loop, desiredPlaySpeed } = this.props;
    if (!currentRoute || playedSeconds === undefined) return;

    const routeOffset = this.routeOffsetFromVideo(playedSeconds);

    // Logs can start before the video: first progress pins the timeline to
    // the first video frame instead of hovering before it.
    if (!this.sourceAdjusted) {
      this.sourceAdjusted = true;
      const commanded = currentOffset();
      if (currentRoute.videoStartOffset && commanded < currentRoute.videoStartOffset) {
        dispatch(seek(currentRoute.videoStartOffset));
        this.seekPlayerToOffset(currentRoute.videoStartOffset);
        return;
      }
    }

    // Loop wrap at the player: seeking the media element (not the wall clock)
    // restarts the selection; the tick below keeps followers in sync.
    if (loop && loop.startTime !== null && loop.startTime !== undefined
      && routeOffset >= loop.startTime + loop.duration) {
      this.seekPlayerToOffset(loop.startTime);
      dispatch(videoTick(loop.startTime));
      return;
    }

    if (desiredPlaySpeed) {
      dispatch(videoTick(routeOffset));
    }
    dispatch(bufferVideo(false));
  }

  onEnded() {
    const { dispatch, loop } = this.props;
    if (loop && loop.startTime !== null && loop.startTime !== undefined) {
      this.seekPlayerToOffset(loop.startTime);
      dispatch(videoTick(loop.startTime));
    } else {
      dispatch(pause());
    }
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, onAudioStatusChange, isMuted } = this.props;
    const { src, videoError, playerKey } = this.state;

    const onPlayerReady = (player) => {
      if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
        const videoElement = player.getInternalPlayer();
        if (videoElement && videoElement.audioTracks && videoElement.audioTracks.length > 0) {
          if (onAudioStatusChange) {
            onAudioStatusChange(true);
          }
        }
      } else { // on other platforms, inspect audio tracks before hls.js changes things
        const hlsPlayer = player.getInternalPlayer('hls');
        if (hlsPlayer) {
          hlsPlayer.on('hlsBufferCodecs', (event, data) => {
            if (onAudioStatusChange) {
              onAudioStatusChange(!!data.audio);
            }
          });
        }
      }
      // A fresh source starts at the commanded position, not at 0.
      this.syncSeek();
    };

    const speed = clampSpeed(desiredPlaySpeed, isMuted);

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo && !videoError} error={videoError} onRetry={videoError ? this.onRetry : null} />
        <ReactPlayer
          key={playerKey}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed && !videoError)}
          onReady={onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={speed}
          onProgress={this.onProgress}
          progressInterval={250}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoResume}
          onPlay={this.onVideoResume}
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
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
