/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, syncPlayback } from '../../timeline/playback';
import { isFirefox } from '../../utils/browser.js';
import {
  playbackRateFor, seekTargetMs, videoOffsetMs, videoSecondsForOffset,
} from './timing';

const HLS_MIME = 'application/vnd.apple.mpegurl';
// micro-stalls shouldn't flicker the spinner over the video
const SPINNER_DELAY_MS = 300;
// failsafe for a seek that never completes (e.g. the network died mid-seek)
const PENDING_SEEK_TIMEOUT_MS = 5000;

const VideoOverlay = ({ loading, error, onRetry }) => {
  if (!loading && !error) {
    return null;
  }
  return (
    <div className="z-50 absolute inset-0 flex flex-col items-center justify-center bg-[#16181AAA]">
      {error ? (
        <>
          <ErrorOutline className="mb-2" />
          <Typography>{error}</Typography>
          <Button
            className="mt-3 rounded-full border border-white/20 px-5"
            style={{ color: Colors.white }}
            onClick={onRetry}
          >
            Try again
          </Button>
        </>
      ) : (
        <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
      )}
    </div>
  );
};

/**
 * The regular video player for a route: a plain <video> element whose clock
 * drives the app instead of the other way around.
 *
 * - video events report the real position through syncPlayback(), which the
 *   map, timeline and time display all read via currentOffset().
 * - the video only moves when something real asks it to: a user seek, a
 *   play/pause/speed change, the loop wrapping around, or a new source.
 * - playback state (playing, buffering, audio, errors) comes straight from
 *   the element's events instead of polling readyState.
 */
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.videoRef = React.createRef();
    this.hls = null;        // hls.js instance, when we decode HLS ourselves
    this.hlsClass = null;
    this.sourceToken = 0;   // guards async source swaps
    this.pendingSeek = null; // timeline offset (ms) we last asked the video for
    this.pendingSeekTimer = null;
    this.issuedPause = false; // we paused the element ourselves
    this.mediaRecovered = false;
    this.spinnerTimer = null;

    this.state = {
      src: null,
      videoError: null,
      spinnerVisible: false,
    };

    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onSeeked = this.onSeeked.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onStalled = this.onStalled.bind(this);
    this.onCanPlay = this.onCanPlay.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onHlsManifest = this.onHlsManifest.bind(this);
    this.onHlsBufferCodecs = this.onHlsBufferCodecs.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.retry = this.retry.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    // set it imperatively too: muted autoplay has to be right on the first frame
    if (this.videoRef.current) {
      this.videoRef.current.muted = this.props.isMuted;
    }
    if (this.props.isBufferingVideo) {
      this.showSpinnerSoon();
    }
    this.attachSourceForRoute(this.props.currentRoute);
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, isMuted, isBufferingVideo, seekCount } = this.props;
    const video = this.videoRef.current;

    if (video && video.muted !== isMuted) {
      video.muted = isMuted;
    }

    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      this.attachSourceForRoute(currentRoute);
    }

    if (seekCount !== undefined && prevProps.seekCount !== seekCount) {
      // someone dragged the timeline or jumped: tell the video to go there
      this.seekTo(currentOffset());
    }

    if (isBufferingVideo && !prevProps.isBufferingVideo) {
      this.showSpinnerSoon();
    } else if (!isBufferingVideo && prevProps.isBufferingVideo) {
      this.hideSpinner();
    }

    this.evaluate();
  }

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.pendingSeekTimer);
    clearTimeout(this.spinnerTimer);
    this.destroyHls();
  }

  // --- source management -------------------------------------------------

  attachSourceForRoute(route) {
    const src = route
      ? api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig)
      : null;

    this.sourceToken += 1;
    this.clearPendingSeek();
    this.issuedPause = false;
    this.mediaRecovered = false;
    this.setState({ src, videoError: null });
    this.props.onAudioStatusChange?.(false);
    this.attachSource(src);
  }

  attachSource(src) {
    const video = this.videoRef.current;
    if (!video) {
      return;
    }
    const token = this.sourceToken;

    if (!src) {
      this.destroyHls();
      video.removeAttribute('src');
      video.load();
      return;
    }

    if (video.canPlayType(HLS_MIME)) {
      // Safari (macOS, iOS, and the iOS PWA) decodes HLS natively
      this.destroyHls();
      video.src = src;
      return;
    }

    // everyone else gets hls.js, loaded on demand so native players never
    // pay for it
    import('hls.js').then(({ default: Hls }) => {
      if (!this.mounted || token !== this.sourceToken) {
        return;
      }
      if (!Hls.isSupported()) {
        console.warn('[DriveVideo] this browser cannot play HLS video');
        return;
      }
      this.destroyHls();
      const hls = new Hls({ maxBufferLength: 40 });
      this.hls = hls;
      this.hlsClass = Hls;
      hls.on(Hls.Events.MANIFEST_PARSED, this.onHlsManifest);
      hls.on(Hls.Events.BUFFER_CODECS, this.onHlsBufferCodecs);
      hls.on(Hls.Events.ERROR, this.onHlsError);
      hls.attachMedia(video);
      hls.loadSource(src);
    }).catch((err) => {
      console.error('[DriveVideo] failed to load hls.js', err);
    });
  }

  destroyHls() {
    if (this.hls) {
      this.hls.destroy(); // also detaches our listeners
      this.hls = null;
      this.hlsClass = null;
    }
  }

  retry() {
    const { src } = this.state;
    if (!src) {
      return;
    }
    const video = this.videoRef.current;
    this.destroyHls();
    if (video) {
      video.removeAttribute('src');
      video.load();
    }
    this.mediaRecovered = false;
    this.setState({ videoError: null }, () => this.evaluate());
    if (this.props.isBufferingVideo) {
      this.showSpinnerSoon();
    }
    this.attachSource(src);
  }

  // --- playback reconciliation -------------------------------------------

  /**
   * Reconcile the element with the timeline. The video owns playback: the
   * timeline follows it through syncPlayback(), and the video only moves
   * when something real asks it to.
   */
  evaluate() {
    const video = this.videoRef.current;
    const {
      currentRoute, desiredPlaySpeed, isMuted, loop,
    } = this.props;
    if (!video || !currentRoute || !this.state.src || this.state.videoError) {
      return;
    }

    // play state and speed follow the timeline's intent
    if (desiredPlaySpeed > 0) {
      const rate = playbackRateFor(desiredPlaySpeed, { muted: isMuted, isFirefox: isFirefox() });
      if (video.playbackRate !== rate) {
        video.playbackRate = rate;
      }
      // wait for the loop restart to land before playing an ended video,
      // otherwise it would start over from the beginning of the stream
      if (video.paused && !(video.ended && this.pendingSeek !== null)) {
        this.playVideo();
      }
    } else if (!video.paused && !this.issuedPause) {
      this.issuedPause = true;
      video.pause();
    }

    // position: only move the video when it's actually out of line
    if (this.pendingSeek !== null) {
      return;
    }
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    const targetMs = seekTargetMs({
      // the timeline can't run ahead of the first frame of video
      timelineMs: Math.max(currentOffset(), videoStartOffset),
      videoMs: videoOffsetMs(video, videoStartOffset),
      loop,
      playSpeed: desiredPlaySpeed,
    });
    if (targetMs !== null) {
      this.seekTo(targetMs);
    }
  }

  playVideo() {
    const video = this.videoRef.current;
    if (!video) {
      return;
    }
    let promise;
    try {
      promise = video.play();
    } catch (err) {
      this.onPlayRejected(err);
      return;
    }
    if (promise && typeof promise.catch === 'function') {
      promise.catch((err) => this.onPlayRejected(err));
    }
  }

  onPlayRejected(err) {
    if (!err || err.name === 'AbortError') {
      // interrupted by a pause or a new source, not a failure
      return;
    }
    if (err.name === 'NotAllowedError' && this.mounted) {
      // autoplay was refused; the timeline follows the video and stops
      this.syncFromVideo();
      this.props.dispatch(pause());
      return;
    }
    console.warn('[DriveVideo] play failed', err);
  }

  seekTo(targetMs) {
    const video = this.videoRef.current;
    const { currentRoute } = this.props;
    if (!video || !currentRoute || video.readyState < 1) {
      // called again once metadata is in
      return;
    }
    const seconds = Math.max(0, videoSecondsForOffset(targetMs, currentRoute.videoStartOffset || 0));
    if (Math.abs(seconds - video.currentTime) < 0.001) {
      return;
    }

    this.pendingSeek = targetMs;
    clearTimeout(this.pendingSeekTimer);
    this.pendingSeekTimer = setTimeout(() => {
      this.pendingSeek = null;
    }, PENDING_SEEK_TIMEOUT_MS);
    try {
      video.currentTime = seconds;
    } catch (err) {
      console.warn('[DriveVideo] seek failed', err);
      this.clearPendingSeek();
    }
  }

  clearPendingSeek() {
    clearTimeout(this.pendingSeekTimer);
    this.pendingSeekTimer = null;
    this.pendingSeek = null;
  }

  /**
   * Hand the timeline the video's real position; the map, timeline and time
   * display all read it from there.
   */
  syncFromVideo() {
    const video = this.videoRef.current;
    const { currentRoute, dispatch } = this.props;
    if (!video || !currentRoute || video.readyState < 1 || this.pendingSeek !== null) {
      return;
    }
    dispatch(syncPlayback(videoOffsetMs(video, currentRoute.videoStartOffset || 0)));
  }

  showSpinnerSoon() {
    if (this.spinnerTimer) {
      return;
    }
    this.spinnerTimer = setTimeout(() => {
      this.spinnerTimer = null;
      if (this.mounted && this.props.isBufferingVideo) {
        this.setState({ spinnerVisible: true });
      }
    }, SPINNER_DELAY_MS);
  }

  hideSpinner() {
    clearTimeout(this.spinnerTimer);
    this.spinnerTimer = null;
    if (this.state.spinnerVisible) {
      this.setState({ spinnerVisible: false });
    }
  }

  // --- element events ----------------------------------------------------

  onLoadedMetadata() {
    const video = this.videoRef.current;
    if (video) {
      // native HLS players expose the audio track list
      const { audioTracks } = video;
      this.props.onAudioStatusChange?.(Boolean(audioTracks && audioTracks.length > 0));
    }
    this.evaluate();
  }

  onTimeUpdate() {
    this.syncFromVideo();
    this.evaluate();
  }

  onSeeked() {
    this.clearPendingSeek();
    const video = this.videoRef.current;
    if (video && video.paused && video.readyState >= 2 && this.props.isBufferingVideo) {
      // a seek while paused finished showing a frame, no spinner needed
      this.props.dispatch(bufferVideo(false));
    }
    this.syncFromVideo();
    this.evaluate();
  }

  onWaiting() {
    if (!this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  onStalled() {
    if (!this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  onCanPlay() {
    const video = this.videoRef.current;
    if (video && video.paused && this.props.isBufferingVideo) {
      // paused with a frame ready: nothing is spinning
      this.props.dispatch(bufferVideo(false));
    }
    this.evaluate();
  }

  onPlaying() {
    const video = this.videoRef.current;
    if (video && this.props.desiredPlaySpeed === 0) {
      // the element started playing against the timeline's intent
      this.issuedPause = true;
      video.pause();
      return;
    }
    this.syncFromVideo();
    if (this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(false));
    }
    this.evaluate();
  }

  onPause() {
    const video = this.videoRef.current;
    if (this.issuedPause) {
      this.issuedPause = false;
      this.syncFromVideo();
      return;
    }
    // The platform stopped the video (or it refused to start); playback
    // stops with it.
    if (video && video.readyState >= 2 && this.props.desiredPlaySpeed > 0) {
      this.syncFromVideo();
      this.props.dispatch(pause());
    }
  }

  onEnded() {
    const { currentRoute, desiredPlaySpeed, loop, dispatch } = this.props;
    if (!currentRoute) {
      return;
    }
    this.clearPendingSeek();
    if (loop && loop.duration > 0) {
      // the timeline has wrapped; start the loop over in the video too
      this.seekTo(loop.startTime);
      return;
    }
    // no loop: the tape ran out
    this.syncFromVideo();
    if (desiredPlaySpeed > 0) {
      dispatch(pause());
    }
  }

  onVideoError() {
    const video = this.videoRef.current;
    if (!video || !video.error || !this.state.src || !this.mounted) {
      return;
    }
    if (this.hls) {
      // hls.js is attached: it sees and reports media problems itself
      return;
    }
    if (video.error.code === MediaError.MEDIA_ERR_NETWORK) {
      this.failPlayback('Unable to load video. Check network connection.');
      return;
    }
    // the element doesn't say why the source failed; ask the server
    const { src } = this.state;
    fetch(src, { method: 'HEAD' })
      .then((resp) => {
        if (!this.mounted) {
          return;
        }
        this.failPlayback(resp.status === 404
          ? 'This video segment has not uploaded yet or has been deleted.'
          : 'Unable to load video');
      })
      .catch(() => {
        if (this.mounted) {
          this.failPlayback('Unable to load video. Check network connection.');
        }
      });
  }

  // --- hls.js events -----------------------------------------------------

  onHlsManifest(_event, data) {
    const hasAudio = (data.audioTracks?.length ?? 0) > 0
      || (data.levels || []).some((level) => Boolean(level.audioCodec));
    this.props.onAudioStatusChange?.(hasAudio);
    this.evaluate();
  }

  onHlsBufferCodecs(_event, data) {
    // muxed audio only shows up once the first fragment is parsed
    if (data.audio || data.audiovideo) {
      this.props.onAudioStatusChange?.(true);
    }
  }

  onHlsError(_event, data) {
    const Hls = this.hlsClass;
    if (!data.fatal || !Hls) {
      return;
    }
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      this.failPlayback(data.response?.code === 404
        ? 'This video segment has not uploaded yet or has been deleted.'
        : 'Unable to load video. Check network connection.');
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.mediaRecovered) {
      this.mediaRecovered = true;
      this.hls?.recoverMediaError();
      return;
    }
    this.failPlayback('Unable to load video');
  }

  failPlayback(message) {
    this.hideSpinner();
    this.clearPendingSeek();
    this.setState({ videoError: message });
    const video = this.videoRef.current;
    if (video && !video.paused && !this.issuedPause) {
      this.issuedPause = true;
      video.pause();
    }
    if (this.props.desiredPlaySpeed > 0) {
      // the video is the clock: it stopped, so playback stops
      this.props.dispatch(pause());
    }
  }

  render() {
    const { isMuted } = this.props;
    const { videoError, spinnerVisible } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] bg-black">
        <video
          ref={this.videoRef}
          className="absolute inset-0 h-full w-full object-contain bg-black"
          playsInline
          muted={isMuted}
          preload="auto"
          onLoadedMetadata={this.onLoadedMetadata}
          onTimeUpdate={this.onTimeUpdate}
          onSeeked={this.onSeeked}
          onWaiting={this.onWaiting}
          onStalled={this.onStalled}
          onCanPlay={this.onCanPlay}
          onPlaying={this.onPlaying}
          onPause={this.onPause}
          onEnded={this.onEnded}
          onError={this.onVideoError}
        />
        <VideoOverlay loading={spinnerVisible} error={videoError} onRetry={this.retry} />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,           // re-evaluate whenever the timeline moves
  startTime: state.startTime,
  seekCount: state.seekCount,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
