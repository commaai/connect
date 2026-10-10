/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline, PlayArrow } from '../../icons';
import { pause, play } from '../../timeline/playback';
import { attachVideo, detachVideo, isNativeHls, videoOffsetMs } from '../../timeline/video';

// show the spinner only once a stall has lasted this long, so warm seeks do not flash it
const SPINNER_DELAY_MS = 150;
// native HLS above 2x switches to I-frame-only or pause/seek/play and freezes the picture (WebKit bug 309378)
const NATIVE_HLS_MAX_RATE = 2;
// playback moves at most this far between two progress ticks (250 ms) at rate 1; a seek jumps further
const MAX_PROGRESS_STEP_S = 1;

// `seeked` and `playing` fire at readyState 3 per spec; Safari native HLS still shows a frozen picture then
export function isStallOver(readyState) {
  return readyState >= 4;
}

// our own `currentTime =` write moves playedSeconds before any data exists there, so only a small forward step is progress
export function isPlaybackProgress(prevSeconds, nowSeconds, seeking, readyState, playbackRate = 1) {
  if (prevSeconds === null || seeking || readyState < 3) {
    return false;
  }
  const step = nowSeconds - prevSeconds;
  return step > 0 && step < MAX_PROGRESS_STEP_S * Math.max(playbackRate, 1);
}

export function playbackRateFor(desiredPlaySpeed, nativeHls) {
  const rate = desiredPlaySpeed || 1;
  return nativeHls ? Math.min(rate, NATIVE_HLS_MAX_RATE) : rate;
}

// videoStartOffset changed after the element was positioned: shift it by the delta to keep the same route offset on screen
export function correctedElementTime(currentTime, oldVso, newVso) {
  const deltaMs = (oldVso || 0) - (newVso || 0);
  if (deltaMs === 0) {
    return null;
  }
  return Math.max(0, currentTime + (deltaMs / 1000));
}

// react-player's onReady is the element's every native `canplay`, one per cold seek on Safari; re-positioning on each
// re-seeked the same target until fully buffered (iPad: 34 writes in 3 s). Position once per source
export function shouldPositionOnReady(positionedSrc, src) {
  return Boolean(src) && positionedSrc !== src;
}

const VideoOverlay = ({ loading, error, tapToPlay, onTap }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (tapToPlay) {
    content = (
      <>
        <PlayArrow className="mb-2" />
        <Typography>Tap to play</Typography>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]" onClick={tapToPlay ? onTap : undefined}>
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onVideoStall = this.onVideoStall.bind(this);
    this.onVideoBufferEnd = this.onVideoBufferEnd.bind(this);
    this.onVideoDataReady = this.onVideoDataReady.bind(this);
    this.onVideoProgress = this.onVideoProgress.bind(this);
    this.onVideoEnded = this.onVideoEnded.bind(this);
    this.onVideoPlay = this.onVideoPlay.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onTapToPlay = this.onTapToPlay.bind(this);

    this.videoPlayer = React.createRef();
    this.video = null; // the <video> element, once ReactPlayer is ready
    this.positionedSrc = null; // the state.src onPlayerReady last positioned the element for
    this.stalledAt = null; // Date.now() when the current stall began, null while frames are flowing
    this.spinnerTimer = null;
    this.lastProgressTime = null;

    this.state = {
      src: null,
      videoError: null,
      spinner: false,
      tapToPlay: false,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    const { seekId, offset, currentRoute } = this.props;
    if (!this.video) {
      return;
    }
    if (prevProps.seekId !== seekId) {
      this.video.currentTime = this.currentVideoTime(offset);
    } else if (currentRoute && prevProps.currentRoute?.fullname === currentRoute.fullname
      && prevProps.currentRoute.videoStartOffset !== currentRoute.videoStartOffset) {
      // the first-frame offset from the events fetch landed after the element was positioned without it
      const seconds = correctedElementTime(
        this.video.currentTime,
        prevProps.currentRoute.videoStartOffset,
        currentRoute.videoStartOffset,
      );
      if (seconds !== null) {
        this.video.currentTime = seconds;
      }
    }
  }

  componentWillUnmount() {
    this.setStalled(false);
    if (this.video) {
      this.video.removeEventListener('seeking', this.onVideoStall);
      this.video.removeEventListener('canplaythrough', this.onVideoDataReady);
      detachVideo(this.video);
      this.video = null;
    }
  }

  onPlayerReady(player) {
    const { onAudioStatusChange, offset, loop, desiredPlaySpeed } = this.props;
    const { src } = this.state;
    const video = player.getInternalPlayer();
    if (video && video !== this.video) {
      this.video = video;
      // ReactPlayer has no onSeeking / onCanPlayThrough props, listen on the element directly
      video.addEventListener('seeking', this.onVideoStall);
      video.addEventListener('canplaythrough', this.onVideoDataReady);
      attachVideo(video);
    }
    // everything below runs once per source: later `canplay` readies for the same source are no-ops
    if (!shouldPositionOnReady(this.positionedSrc, src)) {
      return;
    }
    this.positionedSrc = src;
    if (video) {
      // the element is the clock from here on; start it where redux intended (deep link, route switch)
      video.currentTime = this.currentVideoTime(offset ?? loop?.startTime ?? 0);
    }

    if (isNativeHls()) { // the element plays the m3u8 itself so its audioTracks are visible; through hls.js they are not
      if (video && video.audioTracks && video.audioTracks.length > 0) {
        if (onAudioStatusChange) {
          onAudioStatusChange(true);
        }
      }
      // re-render so the native rate cap applies now that the element is attached
      if (playbackRateFor(desiredPlaySpeed, true) !== playbackRateFor(desiredPlaySpeed, false)) {
        this.forceUpdate();
      }
    } else { // through hls.js, inspect audio tracks before it changes things
      const hlsPlayer = player.getInternalPlayer('hls'); // a new instance per source, so this listener is per source too
      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          if (onAudioStatusChange) {
            onAudioStatusChange(!!data.audio);
          }
        });
      }
    }
  }

  // `waiting` and native `seeking`: no frames until the element says otherwise
  onVideoStall() {
    this.setStalled(true);
  }

  // `seeked`, `canplaythrough` and `playing`: over only once the element has enough data at the new position
  onVideoDataReady() {
    if (this.video && isStallOver(this.video.readyState)) {
      this.setStalled(false);
    }
  }

  // `playing`
  onVideoBufferEnd() {
    this.onVideoDataReady();
    this.onVideoPlay();
  }

  // `play`
  onVideoPlay() {
    const { videoError, tapToPlay } = this.state;
    if (videoError || tapToPlay) this.setState({ videoError: null, tapToPlay: false });
  }

  onVideoProgress({ playedSeconds }) {
    const { loop, desiredPlaySpeed, currentRoute } = this.props;

    // `playing` does not mean frames advance: time moving forward is the signal, measured from the post-seek position
    const { video } = this;
    if (video && isPlaybackProgress(
      this.lastProgressTime,
      playedSeconds,
      video.seeking,
      video.readyState,
      video.playbackRate,
    )) {
      this.setStalled(false);
    }
    this.lastProgressTime = playedSeconds;

    const offset = videoOffsetMs(currentRoute);
    if (loop && desiredPlaySpeed > 0 && offset !== null
      && (offset < loop.startTime || offset > loop.startTime + loop.duration)) {
      this.restartLoop();
    }
  }

  // `ended`: the element pauses itself, wrap to the loop start if the user still wants playback
  onVideoEnded() {
    const { desiredPlaySpeed } = this.props;
    if (desiredPlaySpeed > 0) {
      this.restartLoop();
    }
  }

  onTapToPlay() {
    const { dispatch } = this.props;
    this.setState({ tapToPlay: false });
    dispatch(play(this.speedBeforeBlock || 1));
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
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

    if (e.name === 'NotAllowedError') {
      // play() was blocked (iOS after backgrounding): stop asking and wait for a tap
      const { dispatch, desiredPlaySpeed } = this.props;
      this.speedBeforeBlock = desiredPlaySpeed;
      dispatch(pause());
      this.setStalled(false);
      this.setState({ tapToPlay: true });
      return;
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

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

  setStalled(stalled) {
    if (stalled) {
      if (this.stalledAt !== null) {
        return;
      }
      this.stalledAt = Date.now();
      this.spinnerTimer = setTimeout(() => {
        this.spinnerTimer = null;
        if (this.stalledAt !== null) this.setState({ spinner: true });
      }, SPINNER_DELAY_MS);
    } else {
      if (this.stalledAt === null) {
        return;
      }
      this.stalledAt = null;
      clearTimeout(this.spinnerTimer);
      this.spinnerTimer = null;
      const { spinner } = this.state;
      if (spinner) this.setState({ spinner: false });
    }
  }

  restartLoop() {
    const { loop } = this.props;
    if (!this.video) {
      return;
    }
    this.video.currentTime = this.currentVideoTime(loop ? loop.startTime : 0);
    if (this.video.paused) {
      this.playVideo();
    }
  }

  playVideo() {
    const playRes = this.video.play();
    if (playRes) {
      playRes.catch(this.onVideoError);
    }
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.positionedSrc = null;
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      // the element is reused across routes: the new source's first ready must position it again, even for the same URL
      this.positionedSrc = null;
      this.setState({ src, videoError: null });
    }
  }

  currentVideoTime(offset) {
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

  render() {
    const { desiredPlaySpeed, currentRoute, isMuted } = this.props;
    const { src, videoError, spinner, tapToPlay } = this.state;

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={spinner} error={videoError} tapToPlay={tapToPlay} onTap={this.onTapToPlay} />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          playbackRate={playbackRateFor(desiredPlaySpeed, isNativeHls())}
          progressInterval={250}
          onReady={this.onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          onProgress={this.onVideoProgress}
          onBuffer={this.onVideoStall}
          onBufferEnd={this.onVideoBufferEnd}
          onSeek={this.onVideoDataReady}
          onPlay={this.onVideoPlay}
          onEnded={this.onVideoEnded}
          onError={this.onVideoError}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekId: state.seekId,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
