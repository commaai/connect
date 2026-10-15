/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography, Button } from '@material-ui/core';

import Hls from 'hls.js';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { videoProgress } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

// most browsers don't support more than 16x playback rate; firefox mutes audio
// above 8x, which makes audio cut in and out when the rate shifts
const MAX_PLAYBACK_RATE = 16;
const FIREFOX_AUDIO_PLAYBACK_RATE = 8;

// nothing has played after this long: offer a retry, but it isn't an error yet
const SLOW_LOAD_TIMEOUT_MS = 15000;

const ACTION_BUFFER_VIDEO = 'ACTION_BUFFER_VIDEO';

/**
 * Clamp a playback rate to what browsers actually support.
 *
 * @param {number} playbackRate
 * @param {boolean} firefox - Firefox mutes audio above 8x
 * @param {boolean} isMuted - only matters when audio is on
 * @returns {number}
 */
function clampPlaybackRate(playbackRate, firefox, isMuted) {
  const max = firefox && !isMuted ? FIREFOX_AUDIO_PLAYBACK_RATE : MAX_PLAYBACK_RATE;
  return Math.max(0, Math.min(max, playbackRate));
}

/**
 * Loading / error overlay.
 *
 * `slowLoad` is deliberately NOT an error state: the stream may just be taking
 * its time, so it shows the spinner with a Retry button underneath.
 */
const VideoOverlay = ({ loading, error, slowLoad, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button
          variant="contained"
          className="mt-3 normal-case"
          onClick={onRetry}
          style={{ backgroundColor: Colors.white10, color: Colors.white }}
        >
          Retry
        </Button>
      </>
    );
  } else if (loading) {
    content = (
      <>
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
        {slowLoad && (
          <Button
            variant="contained"
            className="mt-4 normal-case"
            onClick={onRetry}
            style={{ backgroundColor: Colors.white10, color: Colors.white }}
          >
            Retry
          </Button>
        )}
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="z-50 absolute h-full w-full flex items-center justify-center bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)] flex flex-col items-center">
        {content}
      </div>
    </div>
  );
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.isFirefoxUser = isFirefox();

    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onManifestParsed = this.onManifestParsed.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onSeeking = this.onSeeking.bind(this);
    this.onSeeked = this.onSeeked.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onCanPlay = this.onCanPlay.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.retry = this.retry.bind(this);

    this.videoEl = React.createRef();

    // hls.js instance for non-iOS browsers; iOS plays the m3u8 natively
    this.hls = null;
    // offset to apply once the element knows its duration/seekable range
    this.pendingSeekOffset = null;
    this.slowLoadTimer = null;
    this.missingFirstSegmentRecovery = false;
    this.publishRafId = null;
    this.mounted = false;
    // the last position the element itself published; our own publishes must
    // never be mistaken for a user-initiated seek
    this.lastPublishedOffset = null;

    this.state = {
      src: null,
      videoError: null,
      slowLoad: false,
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.updateVideoSource();
  }

  componentDidUpdate(prevProps) {
    if (this.updateVideoSource(prevProps)) {
      return;
    }

    // a new user-requested position: hand it over to the video element
    const { offset } = this.props;
    if (typeof offset === 'number' && typeof prevProps.offset === 'number'
      && offset !== prevProps.offset && offset !== this.lastPublishedOffset) {
      this.seekVideoTo(offset);
    }

    // play/pause/speed changes are requests the video carries out
    if (prevProps.desiredPlaySpeed !== this.props.desiredPlaySpeed
      || prevProps.isBufferingVideo !== this.props.isBufferingVideo) {
      this.applyPlaybackState();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.destroyHls();
    this.clearSlowLoadTimer();
    this.stopPublishLoop();
  }

  dispatchBufferVideo(buffering) {
    this.props.dispatch({ type: ACTION_BUFFER_VIDEO, buffering });
  }

  // ---------------------------------------------------------------------------
  // The <video> element is the clock: everything below either reads its
  // position into redux, or hands it a request (seek / play / pause / speed).
  // ---------------------------------------------------------------------------

  /**
   * Publish the element's own position into redux. Redux only holds a copy of
   * this; the element is the authority.
   */
  onTimeUpdate() {
    this.publishOffset();
  }

  /**
   * While playing, publish on every animation frame so the timeline playhead
   * and the map marker move smoothly. `timeupdate` alone only fires a few
   * times a second.
   */
  startPublishLoop() {
    if (this.publishRafId !== null) {
      return;
    }
    // bound: requestAnimationFrame calls the callback without a receiver
    this.publishRafId = requestAnimationFrame(() => this.publishLoop());
  }

  stopPublishLoop() {
    if (this.publishRafId !== null) {
      cancelAnimationFrame(this.publishRafId);
      this.publishRafId = null;
    }
  }

  publishLoop() {
    this.publishRafId = null;
    if (!this.mounted) {
      return;
    }
    this.publishOffset();
    this.startPublishLoop();
  }

  publishOffset() {
    const { dispatch, currentRoute } = this.props;
    const video = this.videoEl.current;
    if (!video || !currentRoute || Number.isNaN(video.currentTime)) {
      return;
    }

    let offset = video.currentTime * 1000;
    if (currentRoute.videoStartOffset) {
      offset += currentRoute.videoStartOffset;
    }

    this.lastPublishedOffset = offset;
    dispatch(videoProgress(offset));
  }

  onLoadedMetadata() {
    const video = this.videoEl.current;
    if (!video) {
      return;
    }

    this.clearSlowLoadTimer();
    this.setState({ slowLoad: false });
    this.reportAudioTracks();

    if (this.pendingSeekOffset !== null) {
      const pending = this.pendingSeekOffset;
      this.pendingSeekOffset = null;
      this.seekVideoTo(pending);
    } else if (typeof this.props.offset === 'number') {
      this.seekVideoTo(this.props.offset);
    }

    this.applyPlaybackState();
  }

  onPlaying() {
    this.clearSlowLoadTimer();
    this.setState({ videoError: null, slowLoad: false });
    this.startPublishLoop();
    if (this.props.isBufferingVideo) {
      this.dispatchBufferVideo(false);
    }
  }

  onPause() {
    // publish the final resting position, then stop the loop
    this.publishOffset();
    this.stopPublishLoop();
  }

  onSeeking() {
    // a seek empties the buffer, so we're buffering until data comes back
    this.clearSlowLoadTimer();
    this.setState({ slowLoad: false });
    if (!this.props.isBufferingVideo) {
      this.dispatchBufferVideo(true);
    }
  }

  onSeeked() {
    this.applyPlaybackState();
  }

  onWaiting() {
    if (!this.props.isBufferingVideo) {
      this.dispatchBufferVideo(true);
    }
  }

  onCanPlay() {
    this.clearSlowLoadTimer();
    this.setState({ videoError: null, slowLoad: false });
    this.applyPlaybackState();
    if (this.props.isBufferingVideo) {
      this.dispatchBufferVideo(false);
    }
  }

  /**
   * @param {Event} e
   */
  onVideoError(e) {
    const video = this.videoEl.current;
    const mediaError = video && video.error;
    const errorCode = mediaError ? mediaError.code : 0;

    if (errorCode === 4 && !this.missingFirstSegmentRecovery) {
      // MEDIA_ERR_SRC_NOT_SUPPORTED. Native HLS (iOS) skips a missing segment,
      // unless it is the very first one. Seeking elsewhere reloads the stream
      // from that seek target.
      this.missingFirstSegmentRecovery = true;
      const offset = typeof this.props.offset === 'number' ? this.props.offset : 0;
      this.setState({ videoError: null, slowLoad: false });
      this.loadSource(this.state.src, offset + 1000);
      return;
    }

    if (errorCode === 2) { // MEDIA_ERR_NETWORK
      console.error('Network error', { e });
      this.setVideoError('Unable to load video. Check network connection.');
      return;
    }

    if (errorCode === 3) { // MEDIA_ERR_DECODE
      console.error('Decode error', { e });
      this.setVideoError('Unable to play this video. Try reloading the stream.');
      return;
    }

    if (errorCode === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED, after recovery
      console.error('Unsupported source', { e });
      this.setVideoError('Unable to load video. The video format is not supported.');
      return;
    }

    console.warn('Unknown video error', { e });
    this.setVideoError('Unable to load video');
  }

  /**
   * @param {string} type - hls.js event type
   * @param {object} e - hls.js error data
   */
  onHlsError(type, e) {
    // non-fatal errors are hls.js telling us it is coping; playback is fine
    if (!e.fatal) {
      return;
    }

    if (e.type === Hls.ErrorTypes.NETWORK_ERROR) {
      if (e.response?.code === 404) {
        // hls.js loads ahead, so this usually means playback reached a segment
        // that was never uploaded (or was deleted). The following segment may
        // well exist, so seek past the gap and keep the clock running.
        if (this.seekPastMissingSegment(e)) {
          return;
        }
        this.setVideoError('This video segment has not uploaded yet or has been deleted.');
        return;
      }

      console.error('Network error', { type, e });
      this.setVideoError('Unable to load video. Check network connection.');
      return;
    }

    if (e.type === Hls.ErrorTypes.MEDIA_ERROR && this.hls) {
      // let hls.js try to fix it itself before surfacing anything
      this.hls.recoverMediaError();
      return;
    }

    console.error('Video error', { type, e });
    this.setVideoError('Unable to load video');
  }

  onManifestParsed() {
    this.reportAudioTracks();
  }

  reportAudioTracks() {
    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) {
      return;
    }

    if (isIos()) {
      // ios does not support hls.js; audioTracks live on the element itself
      const video = this.videoEl.current;
      if (video && video.audioTracks && video.audioTracks.length > 0) {
        onAudioStatusChange(true);
      }
      return;
    }

    // on other platforms, inspect the codecs before hls.js changes anything
    if (this.hls) {
      this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => {
        onAudioStatusChange(!!data.audio);
      });
    }
  }

  /**
   * Skip over a segment the server does not have (404).
   *
   * @param {object} e - the hls.js error data
   * @returns {boolean} true when we recovered by seeking past the gap
   */
  seekPastMissingSegment(e) {
    const video = this.videoEl.current;
    const fragment = e.frag;
    if (!video || !this.hls || !fragment || !Number.isFinite(video.duration)) {
      return false;
    }

    // land just past the end of the segment we cannot load
    const seekTarget = Math.min(fragment.start + fragment.duration, video.duration);

    try {
      this.hls.trigger(Hls.Events.BUFFER_FLUSHED, {
        startOffset: 0,
        endOffset: fragment.start,
      });
      video.currentTime = seekTarget;
      this.hls.startLoad();
      return true;
    } catch (err) {
      console.error('[DriveVideo] unable to seek past missing segment', err);
      return false;
    }
  }

  setVideoError(videoError) {
    this.clearSlowLoadTimer();
    this.setState({ videoError, slowLoad: false });
  }

  clearSlowLoadTimer() {
    if (this.slowLoadTimer !== null) {
      clearTimeout(this.slowLoadTimer);
      this.slowLoadTimer = null;
    }
  }

  startSlowLoadTimer() {
    this.clearSlowLoadTimer();
    this.setState({ slowLoad: false });
    this.slowLoadTimer = setTimeout(() => {
      this.slowLoadTimer = null;
      if (!this.state.videoError) {
        this.setState({ slowLoad: true });
      }
    }, SLOW_LOAD_TIMEOUT_MS);
  }

  // ---------------------------------------------------------------------------
  // source handling
  // ---------------------------------------------------------------------------

  retry() {
    const { src } = this.state;
    this.destroyHls();
    this.setState({ videoError: null, slowLoad: false });
    if (src) {
      this.loadSource(src);
    }
  }

  updateVideoSource(prevProps = {}) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.destroyHls();
        this.clearSlowLoadTimer();
        this.setState({ src: '', videoError: null, slowLoad: false });
      }
      return false;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.setState({ src, videoError: null, slowLoad: false });
      this.loadSource(src);
      return true;
    }

    return false;
  }

  /**
   * @param {string} src - the m3u8 url
   * @param {number} [startOffset] - route offset (ms) to land on once loaded
   */
  loadSource(src, startOffset) {
    const video = this.videoEl.current;
    if (!video || !src) {
      return;
    }

    this.destroyHls();
    this.clearSlowLoadTimer();
    this.lastPublishedOffset = null;

    // Reset the missing-first-segment guard for a genuinely new load, but not
    // for the recovery reload that the guard itself triggers -- clearing it
    // there makes the recovery retry forever, since the same error comes back.
    if (startOffset === undefined) {
      this.missingFirstSegmentRecovery = false;
    }

    // remember where we are so the element can be sent there once it loads
    const target = typeof startOffset === 'number' ? startOffset : this.props.offset;
    if (typeof target === 'number') {
      this.pendingSeekOffset = target;
    }

    this.startSlowLoadTimer();

    if (isIos() || !Hls.isSupported()) {
      // ios plays the m3u8 natively
      video.src = src;
      video.load();
      return;
    }

    this.hls = new Hls({
      maxBufferLength: 40,
    });

    this.hls.on(Hls.Events.MANIFEST_PARSED, this.onManifestParsed);
    this.hls.on(Hls.Events.ERROR, this.onHlsError);

    this.hls.loadSource(src);
    this.hls.attachMedia(video);
  }

  destroyHls() {
    this.stopPublishLoop();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  /**
   * Map a route offset (ms) onto the element's timeline (seconds). Logs can
   * start before the video does, so videoStartOffset still applies.
   *
   * @param {number} offset
   * @returns {number}
   */
  videoTimeForOffset(offset) {
    const { currentRoute } = this.props;
    if (!currentRoute || typeof offset !== 'number') {
      return 0;
    }

    let videoTime = offset;
    if (currentRoute.videoStartOffset) {
      videoTime -= currentRoute.videoStartOffset;
    }

    return Math.max(0, videoTime / 1000);
  }

  seekVideoTo(offset) {
    const video = this.videoEl.current;
    if (!video) {
      return;
    }

    const target = this.videoTimeForOffset(offset);

    if (!this.pendingSeekOffset) {
      if (video.seekable && video.seekable.length > 0) {
        const seekableEnd = video.seekable.end(video.seekable.length - 1);
        if (target > seekableEnd) {
          // not seekable yet; apply it once the seekable range is known
          this.pendingSeekOffset = offset;
          return;
        }
      } else if (!Number.isFinite(video.duration)) {
        this.pendingSeekOffset = offset;
        return;
      }
    }

    this.pendingSeekOffset = null;
    video.currentTime = target;
  }

  applyPlaybackState() {
    const video = this.videoEl.current;
    if (!video) {
      return;
    }

    const { desiredPlaySpeed, isBufferingVideo, isMuted } = this.props;

    // while buffering the element has to be stopped, otherwise iOS keeps
    // running its clock at whatever rate it was left at
    const rate = isBufferingVideo
      ? 0
      : clampPlaybackRate(desiredPlaySpeed, this.isFirefoxUser, isMuted);

    if (rate === 0) {
      video.playbackRate = 1;
      video.pause();
      return;
    }

    video.playbackRate = rate;
    if (video.paused) {
      const playRes = video.play();
      if (playRes) {
        playRes.catch(() => console.debug('[DriveVideo] play interrupted by pause'));
      }
    }
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { src, videoError, slowLoad } = this.state;

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={isBufferingVideo && Boolean(currentRoute && src)}
          error={videoError}
          slowLoad={slowLoad}
          onRetry={this.retry}
        />
        <video
          ref={this.videoEl}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          preload="auto"
          autoPlay={Boolean(currentRoute && src && desiredPlaySpeed !== 0)}
          onLoadedMetadata={this.onLoadedMetadata}
          onPlaying={this.onPlaying}
          onPause={this.onPause}
          onSeeking={this.onSeeking}
          onSeeked={this.onSeeked}
          onWaiting={this.onWaiting}
          onCanPlay={this.onCanPlay}
          onError={this.onVideoError}
          onTimeUpdate={this.onTimeUpdate}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  isBufferingVideo: state.isBufferingVideo,
  routes: state.routes,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
