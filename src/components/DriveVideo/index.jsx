/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, getVideo, mediaTimeFor, setVideo, setVideoStartOffset } from '../../timeline';
import { bufferVideo, seek, videoTime } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error }) => {
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
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

/** Firefox mutes audio above 8x, which cuts in and out while the rate shifts. */
const MAX_RATE = (isMuted) => (isMuted ? 16 : 8);

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onProgress = this.onProgress.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onRateChange = this.onRateChange.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.applySeek = this.applySeek.bind(this);
    this.applyPlayback = this.applyPlayback.bind(this);

    this.videoRef = React.createRef();
    this.hls = null;
    this.hlsLoadId = 0;

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.mountVideo();
    this.loadSource();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, desiredPlaySpeed, isMuted } = this.props;

    if (prevProps.currentRoute !== currentRoute) {
      this.loadSource();
      return;
    }

    if (this.shouldSeek(prevProps)) {
      this.applySeek();
      return;
    }

    // Commands, issued only when the user actually changes something. The video
    // is never told to re-derive its own position.
    if (prevProps.desiredPlaySpeed !== desiredPlaySpeed || prevProps.isMuted !== isMuted) {
      this.applyPlayback();
    }
  }

  componentWillUnmount() {
    this.hlsLoadId += 1; // invalidate in-flight hls.js loads
    this.detachHls();
    setVideo(null);
  }

  /**
   * True when a new route offset was requested by the user (not by the video).
   */
  shouldSeek(prevProps) {
    const { currentRoute, offset } = this.props;
    if (prevProps.offset === offset) return false;
    if (offset === null || offset === undefined) return false;

    // A route change or a camera-timing correction moves the recorded position
    // without the user asking; those are handled by loadSource/metadata.
    if (prevProps.currentRoute !== currentRoute) return false;
    if (prevProps.currentRoute && currentRoute
      && prevProps.currentRoute.videoStartOffset !== currentRoute.videoStartOffset) return false;

    return true;
  }

  mountVideo() {
    const element = this.videoRef.current;
    if (!element) return;

    setVideo(element);
    element.playbackRate = this.props.desiredPlaySpeed || 1;

    // Media events are the only source of position. Nothing polls.
    element.addEventListener('loadedmetadata', this.onLoadedMetadata);
    element.addEventListener('timeupdate', this.onTimeUpdate);
    element.addEventListener('seeking', this.onTimeUpdate);
    element.addEventListener('progress', this.onProgress);
    element.addEventListener('waiting', this.onWaiting);
    element.addEventListener('stalled', this.onWaiting);
    element.addEventListener('playing', this.onPlaying);
    element.addEventListener('canplay', this.onPlaying);
    element.addEventListener('ratechange', this.onRateChange);
    element.addEventListener('error', this.onVideoError);
  }

  /**
   * Translate a route offset into a media seek. Used for user seeks and for the
   * loop wrap, both of which go through the reducer so state stays consistent.
   */
  applySeek() {
    const { dispatch, offset } = this.props;
    if (offset === null || offset === undefined) return;

    const element = this.videoRef.current;
    if (!element) {
      // No element yet: record the request so it is applied once metadata loads.
      dispatch(videoTime(offset));
      return;
    }

    const target = mediaTimeFor(offset);
    if (Number.isFinite(target) && element.currentTime !== target) {
      element.currentTime = target;
    }
    dispatch(videoTime(offset));
  }

  /** Apply the user's chosen rate and play/pause intent to the element. */
  applyPlayback() {
    const { desiredPlaySpeed, isMuted } = this.props;
    const element = this.videoRef.current;
    if (!element) return;

    const rate = Math.max(0, Math.min(MAX_RATE(isMuted), desiredPlaySpeed));
    if (element.playbackRate !== rate) {
      element.playbackRate = rate;
    }

    if (desiredPlaySpeed) {
      const result = element.play();
      if (result) result.catch(() => console.debug('[DriveVideo] play interrupted by pause'));
    } else if (!element.paused) {
      element.pause();
    }
  }

  onLoadedMetadata() {
    const { dispatch, currentRoute } = this.props;
    if (setVideoStartOffset(currentRoute?.videoStartOffset)) {
      // The camera's origin moved: re-map so the picture still matches the route.
      this.applySeek();
    }
    dispatch(bufferVideo(false));
    this.applyPlayback();
  }

  onTimeUpdate() {
    const { dispatch, currentRoute } = this.props;
    if (!currentRoute) return;

    const offset = currentOffset();
    dispatch(videoTime(offset));
    this.checkLoop(offset);
  }

  /**
   * Loop from real media time, so the wrap happens when the picture does.
   */
  checkLoop(offset) {
    const { dispatch, loop } = this.props;
    if (!loop || loop.startTime === null) return;

    const loopEnd = loop.startTime + loop.duration;
    if (offset >= loopEnd || offset < loop.startTime) {
      dispatch(seek(loop.startTime));
    }
  }

  onProgress() {
    const element = this.videoRef.current;
    if (element && element.readyState >= 3) {
      this.props.dispatch(bufferVideo(false));
    }
  }

  onWaiting() {
    this.props.dispatch(bufferVideo(true));
  }

  onPlaying() {
    const { videoError } = this.state;
    if (videoError) {
      this.setState({ videoError: null });
    }
    this.props.dispatch(bufferVideo(false));
  }

  onRateChange() {
    const element = this.videoRef.current;
    if (!element) return;
    // hls.js and iOS clamp the rate themselves; record what actually applied.
    const { desiredPlaySpeed } = this.props;
    if (desiredPlaySpeed && element.playbackRate !== desiredPlaySpeed) {
      this.props.dispatch(videoTime(currentOffset()));
    }
  }

  detachHls() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  /**
   * Attach the stream. Native HLS is used where the browser supports it (iOS and
   * Safari), and hls.js takes over everywhere else. This mirrors the previous
   * react-player configuration, including the 40s buffer window.
   */
  loadSource() {
    const { currentRoute } = this.props;
    this.detachHls();

    if (!currentRoute) {
      setVideo(null);
      if (this.state.src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    setVideoStartOffset(currentRoute.videoStartOffset);
    this.setState({ src, videoError: null });
    this.mountHls(src);
  }

  mountHls(src) {
    const element = this.videoRef.current;
    if (!element) return;

    const loadId = ++this.hlsLoadId;
    const { onAudioStatusChange } = this.props;

    // Safari/iOS play HLS natively. hls.js must not attach there: it would replace
    // a working native pipeline and break audio track reporting.
    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = src;
      this.reportNativeAudio(onAudioStatusChange);
      return;
    }

    import('hls.js').then(({ default: Hls }) => {
      if (loadId !== this.hlsLoadId || !this.videoRef.current) return; // route changed or unmounted

      if (!Hls.isSupported()) {
        element.src = src;
        return;
      }

      const hls = new Hls({ maxBufferLength: 40 });
      this.hls = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hls.startLoad();
      });

      hls.on(Hls.Events.ERROR, (event, data) => this.onHlsError(data));

      // hls.js owns the media element, so audio must be read from the codec info.
      hls.on(Hls.Events.BUFFER_CODECS, (event, data) => {
        if (onAudioStatusChange) onAudioStatusChange(!!data.audio);
      });

      hls.loadSource(src);
      hls.attachMedia(element);
    }).catch(() => {
      if (loadId === this.hlsLoadId && this.videoRef.current) {
        this.videoRef.current.src = src;
      }
    });
  }

  /** iOS reports audio through the element; it cannot play via hls.js. */
  reportNativeAudio(onAudioStatusChange) {
    const element = this.videoRef.current;
    if (!element || !onAudioStatusChange) return;

    const tracks = element.audioTracks;
    if (tracks && tracks.length > 0) {
      onAudioStatusChange(true);
      return;
    }

    // Some Safari builds populate audioTracks after playback starts.
    tracks?.addEventListener?.('addtrack', () => {
      if (tracks.length > 0) onAudioStatusChange(true);
    });
  }

  onHlsError(data) {
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (data.type === HlsErrorTypes.MEDIA
      && (data.details === 'bufferStalledError' || data.details === 'bufferNudgeOnStall')) {
      return; // recoverable stall, not a failure
    }

    if (data.fatal) {
      this.setState({ videoError: this.errorMessage(data) });
    } else if (data.response?.code === 404) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    }
  }

  errorMessage(data) {
    if (data.response?.code === 404) {
      return 'This video segment has not uploaded yet or has been deleted.';
    }
    if (data.type === HlsErrorTypes.NETWORK) {
      return 'Unable to load video. Check network connection.';
    }
    return data.response?.text || 'Unable to load video';
  }

  /**
   * Native media error (including iOS and Safari, where hls.js is not used).
   * @param {Event} e
   */
  onVideoError(e) {
    if (!e) return;
    this.props.dispatch(bufferVideo(true));

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      console.warn('Video error with undefined src, ignoring', e);
      return;
    }

    const mediaError = this.videoRef.current?.error;
    if (!mediaError) return;

    if (mediaError.code === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
      this.setState({ videoError: 'Unable to load video' });
    } else if (mediaError.message) {
      this.setState({ videoError: mediaError.message });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
  }

  render() {
    const { isBufferingVideo, isMuted, desiredPlaySpeed } = this.props;
    const { src, videoError } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <video
          ref={this.videoRef}
          src={src}
          playsInline
          muted={isMuted}
          preload="auto"
          className="h-full w-full"
          style={{ objectFit: 'contain' }}
          data-playback-rate={desiredPlaySpeed}
        />
      </div>
    );
  }
}

// hls.js error type constants, inlined to avoid importing the library on iOS.
const HlsErrorTypes = { NETWORK: 'networkError', MEDIA: 'mediaError' };

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  isBufferingVideo: state.isBufferingVideo,
  routes: state.routes,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);