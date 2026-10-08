import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { mediaState, pause, play } from '../../timeline/playback';
import { isFirefox, isIos } from '../../utils/browser';
import { loadHls } from './hls';

const NO_VIDEO = 'No video is available in the selected range.';

const mediaReady = (media) => media.readyState >= 2;

const MEDIA_EVENTS = ['loadedmetadata', 'durationchange', 'loadeddata', 'canplay', 'play', 'playing',
  'pause', 'waiting', 'stalled', 'seeking', 'seeked', 'timeupdate', 'ended'];

const VideoOverlay = ({ loading, error, onRetry }) => {
  if (!error && !loading) return null;
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA] flex items-center justify-center">
      <div className="text-center">
        {error ? <>
          <ErrorOutline className="mb-2" />
          <Typography>{error}</Typography>
          {onRetry && <Button onClick={onRetry} style={{ color: Colors.white }}>Retry</Button>}
        </> : <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />}
      </div>
    </div>
  );
};

// Playback commands affect the native player. Its events publish actual
// position and status; dependent UI never advances an independent clock.
export class DriveVideo extends Component {
  state = { error: null, retry: 0 };
  video = React.createRef();

  componentDidMount() {
    this.mounted = true;
    this.loadSource();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.resumeOffset = null;
      this.loadSource();
    }
    if (!this.media) return;
    if (prevProps.currentRoute?.videoStartOffset !== this.props.currentRoute?.videoStartOffset) {
      if (this.seekId === this.props.seekRequest?.id) {
        // Camera timing arrives with the route events after media has loaded.
        // Preserve the route timestamp already reached when calibrating it.
        const reached = this.media.currentTime * 1000 + (prevProps.currentRoute?.videoStartOffset ?? 0);
        if (!this.seekTo(reached)) {
          this.resumeOffset = reached;
          this.seekId = null;
        } else if (this.media.paused && this.props.desiredPlaySpeed) {
          this.applyPlayback();
        }
      } else {
        this.applySeek();
      }
      this.publish();
    }
    if (prevProps.loop !== this.props.loop && this.state.error === NO_VIDEO) {
      this.setState({ error: null });
    }
    if (prevProps.seekRequest !== this.props.seekRequest) this.applySeek();
    if (prevProps.isMuted !== this.props.isMuted) this.applyRate();
    if (prevProps.playRequest !== this.props.playRequest && !this.state.error) this.applyPlayback();
  }

  componentWillUnmount() {
    this.mounted = false;
    this.detach();
  }

  sourceKey = () => `${this.props.currentRoute?.fullname}:${this.state.retry}`;

  detach = () => {
    this.operation = (this.operation ?? 0) + 1;
    if (this.media) {
      MEDIA_EVENTS.forEach((event) => this.media.removeEventListener(event, this.onMediaEvent));
      this.media.audioTracks?.removeEventListener?.('addtrack', this.onAudioTracks);
      this.media.audioTracks?.removeEventListener?.('change', this.onAudioTracks);
      this.media.pause();
      this.media.removeAttribute('src');
      this.media.load();
    }
    this.hls?.destroy();
    this.media = null;
    this.hls = null;
    this.seekId = null;
    this.pendingSeekId = null;
  };

  loadSource = () => {
    this.detach();
    this.setState({ error: null });
    this.props.onAudioStatusChange?.(false);
    const media = this.video.current;
    const { currentRoute } = this.props;
    if (!media || !currentRoute) return;
    this.media = media;
    this.route = currentRoute.fullname;
    this.waiting = false;
    this.aborted = false;
    this.props.dispatch(mediaState(this.route, { offset: null, isPlaying: false, isBufferingVideo: true }));
    this.rejected = false;
    this.transportReady = false;
    const key = this.sourceKey();
    MEDIA_EVENTS.forEach((event) => media.addEventListener(event, this.onMediaEvent));
    media.audioTracks?.addEventListener?.('addtrack', this.onAudioTracks);
    media.audioTracks?.addEventListener?.('change', this.onAudioTracks);
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
    if (isIos() || (!window.MediaSource && media.canPlayType('application/vnd.apple.mpegurl'))) {
      media.src = src;
      this.transportReady = true;
      this.applyPlayback();
    } else {
      loadHls().then((Hls) => {
        if (!this.mounted || key !== this.sourceKey() || this.media !== media) return;
        if (!Hls.isSupported()) throw new Error('HLS is not supported');
        this.hls = new Hls({ maxBufferLength: 40 });
        this.hls.on(Hls.Events.BUFFER_CODECS, this.onCodecs);
        this.hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) this.onError(data, data, key);
        });
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (this.media !== media) return;
          this.transportReady = true;
          this.applyPlayback();
        });
        this.hls.loadSource(src);
        this.hls.attachMedia(media);
      }).catch((error) => this.onError(error, null, key));
    }
  };

  onCodecs = (_event, data) => this.props.onAudioStatusChange?.(Boolean(data.audio));
  onAudioTracks = () => this.props.onAudioStatusChange?.(Boolean(this.media?.audioTracks?.length));

  routeOffset = () => this.media.currentTime * 1000 + (this.props.currentRoute.videoStartOffset ?? 0);

  seekTo = (offset) => {
    const videoStart = this.props.currentRoute.videoStartOffset ?? 0;
    const time = Math.max(0, (offset - videoStart) / 1000);
    // Native HLS metadata can precede usable frames. Seeking then can strand
    // iOS at the initial frame; wait for data, while allowing play immediately.
    if (this.media.readyState < 2 || !Number.isFinite(this.media.duration) || !this.media.duration) return false;
    try {
      const target = Math.min(time, this.media.duration);
      if (this.media.currentTime !== target) {
        this.operation += 1; // A newer seek owns any pending play result.
        this.media.currentTime = target;
      }
      return true;
    } catch {
      // Keep the latest command pending until loadeddata/canplay.
      return false;
    }
  };

  applySeek = () => {
    const { seekRequest, offset, loop, currentRoute } = this.props;
    if (this.seekId === seekRequest?.id) return;
    if (this.pendingSeekId !== seekRequest?.id) {
      this.operation += 1;
      this.pendingSeekId = seekRequest?.id;
    }
    const requested = seekRequest?.route === currentRoute.fullname ? seekRequest.offset : null;
    const target = requested ?? this.resumeOffset ?? offset ?? loop?.startTime ?? currentRoute.videoStartOffset ?? 0;
    if (this.seekTo(target)) {
      this.seekId = seekRequest?.id;
      this.resumeOffset = null;
      if (this.media.paused && this.props.desiredPlaySpeed) this.applyPlayback();
    }
  };

  applyRate = () => {
    const rate = Math.min(this.props.desiredPlaySpeed || this.media.playbackRate,
      isFirefox() && !this.props.isMuted ? 8 : 16);
    if (this.media.playbackRate !== rate) this.media.playbackRate = rate;
  };

  applyPlayback = () => {
    if (!this.transportReady) return;
    const media = this.media;
    this.operation += 1;
    const operation = this.operation;
    const { desiredPlaySpeed } = this.props;
    if (!desiredPlaySpeed) {
      media.pause();
      return;
    }
    // Use the selected rate without drift corrections. Pause is a native
    // command, never playbackRate = 0.
    this.applyRate();
    this.rejected = false;
    const rejected = (error) => {
      if (this.mounted && this.media === media && operation === this.operation) {
        if (error?.name === 'AbortError' && media.readyState < 2) {
          this.aborted = true;
          return;
        }
        this.rejected = true;
        // Only the latest request may update controls after rejection.
        this.props.dispatch(pause());
        this.props.dispatch(mediaState(this.route, { isPlaying: false, isBufferingVideo: false }));
      }
    };
    try {
      media.play()?.catch(rejected);
    } catch (error) {
      rejected(error);
    }
  };

  publish = () => {
    if (!this.media || this.route !== this.props.currentRoute?.fullname) return;
    const media = this.media;
    this.props.dispatch(mediaState(this.route, {
      offset: this.routeOffset(),
      isPlaying: !media.paused && !media.ended,
      isBufferingVideo: !this.rejected && (media.seeking || media.readyState < 2 || this.waiting),
    }));
  };

  restartLoop = () => {
    const { loop, desiredPlaySpeed, currentRoute } = this.props;
    const videoStart = currentRoute.videoStartOffset ?? 0;
    if (!loop || !desiredPlaySpeed || loop.duration <= 0
      || loop.startTime + loop.duration <= videoStart
      || loop.startTime >= this.media.duration * 1000 + videoStart) return false;
    if (!this.seekTo(loop.startTime)) return false;
    if (this.media.paused) this.applyPlayback();
    return true;
  };

  onMediaEvent = (event) => {
    if (event.currentTarget !== this.media || this.route !== this.props.currentRoute?.fullname) return;
    if (event.type === 'loadedmetadata') this.onAudioTracks();
    if (event.type === 'waiting') this.waiting = true;
    if (['canplay', 'playing', 'seeked', 'pause'].includes(event.type)) this.waiting = false;
    if (['loadeddata', 'durationchange', 'canplay'].includes(event.type)) this.applySeek();
    if (this.aborted && mediaReady(event.currentTarget)) {
      this.aborted = false;
      this.applyPlayback();
    }
    if (event.type === 'stalled' && !this.hls && (this.media.readyState < 2 || this.waiting)) {
      this.onError(event, null, this.sourceKey());
      return;
    }
    if (event.type === 'ended') {
      if (!this.restartLoop()) this.props.dispatch(pause());
    } else if (event.type === 'timeupdate' && !this.media.seeking && this.props.loop && this.props.desiredPlaySpeed
      && this.routeOffset() >= this.props.loop.startTime + this.props.loop.duration) {
      if (!this.restartLoop()) {
        this.props.dispatch(pause());
        this.setState({ error: NO_VIDEO });
      }
    }
    this.publish();
    if (event.type === 'seeked' && !this.media.seeking && this.seekId === this.props.seekRequest?.id
      && this.props.seekRequest.offset != null) {
      this.props.dispatch(mediaState(this.route, { seekRequest: { ...this.props.seekRequest, offset: null } }));
    }
  };

  onError = (error, data, key) => {
    if (!this.mounted || key !== this.sourceKey()) return;
    const missing = data?.response?.code === 404 || error?.response?.code === 404;
    this.resumeSpeed = this.props.desiredPlaySpeed || 1;
    this.rejected = true;
    this.operation = (this.operation ?? 0) + 1;
    this.media?.pause();
    this.props.dispatch(pause());
    this.props.dispatch(mediaState(this.props.currentRoute.fullname, { isPlaying: false, isBufferingVideo: false }));
    this.setState({ error: missing ? 'This video segment has not uploaded yet or has been deleted.'
      : 'Unable to load video. Check your connection and retry.' });
  };

  retry = () => {
    this.resumeOffset = this.seekId === this.props.seekRequest?.id ? this.props.offset : null;
    this.detach();
    this.props.onAudioStatusChange?.(false);
    this.props.dispatch(mediaState(this.props.currentRoute.fullname, { isPlaying: false, isBufferingVideo: true }));
    this.props.dispatch(play(this.resumeSpeed || 1));
    this.setState((state) => ({ error: null, retry: state.retry + 1 }), this.loadSource);
  };

  render() {
    const { currentRoute, isMuted, isBufferingVideo } = this.props;
    const key = this.sourceKey();
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={this.state.error} onRetry={this.state.error === NO_VIDEO ? null : this.retry} />
        {currentRoute && <video
          key={key}
          ref={this.video}
          playsInline
          muted={isMuted}
          preload="auto"
          className="w-full h-full"
          onError={(event) => this.onError(event, null, key)}
        />}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  playRequest: state.playRequest,
  offset: state.offset,
  seekRequest: state.seekRequest,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
