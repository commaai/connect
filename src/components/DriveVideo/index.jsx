import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';
import { api } from '../../api/backend';
import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, pause, bufferVideo, videoProgress } from '../../timeline/playback';
import { isFirefox } from '../../utils/browser.js';

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

export class DriveVideo extends Component {
  videoPlayer = React.createRef();
  state = { videoError: null, retry: 0, route: null };

  static getDerivedStateFromProps(props, state) {
    const route = JSON.stringify([props.currentRoute?.fullname, props.currentRoute?.share_exp, props.currentRoute?.share_sig]);
    return route !== state.route ? { route, videoError: null, retry: state.retry + 1 } : null;
  }
  media = null;
  listeners = [];
  pendingSeek = false;
  frameRequest = null;

  componentDidUpdate(prevProps) {
    if (prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.detachMedia();
      this.props.onAudioStatusChange?.(false);
      this.props.dispatch(bufferVideo(true));
    } else if (prevProps.seekRevision !== this.props.seekRevision) {
      this.seekMedia();
    }
  }

  componentWillUnmount() {
    this.detachMedia();
  }

  detachMedia() {
    this.listeners.forEach(([target, event, listener]) => target.removeEventListener(event, listener));
    this.listeners = [];
    if (this.frameRequest !== null) this.media?.cancelVideoFrameCallback?.(this.frameRequest);
    this.frameRequest = null;
    this.media = null;
    this.pendingSeek = false;
    if (this.hls && this.audioListener) this.hls.off('hlsBufferCodecs', this.audioListener);
    this.hls = null;
  }

  seekMedia = () => {
    if (!this.media || !this.props.currentRoute) return;
    const seconds = Math.max(0, (currentOffset(this.props) - (this.props.currentRoute.videoStartOffset || 0)) / 1000);
    this.pendingSeek = true;
    this.props.dispatch(bufferVideo(true));
    if (this.media.readyState === 0) return; // HLS manifest can arrive before metadata.
    const wasEnded = this.media.ended;
    // Native currentTime keeps the latest command even during rapid scrubbing.
    this.seekTarget = Math.min(seconds, Number.isFinite(this.media.duration) ? this.media.duration : seconds);
    if (!this.media.seeking && Math.abs(this.media.currentTime - this.seekTarget) < 0.01) {
      this.onSeeked(); // A seek to the existing position need not emit seeked.
    } else {
      this.media.currentTime = this.seekTarget;
    }
    if (wasEnded && this.props.desiredPlaySpeed) {
      const media = this.media;
      const route = this.props.currentRoute.fullname;
      const retry = this.state.retry;
      media.play()?.catch((error) => {
        if (this.media === media) this.onError(error, null, route, retry);
      });
    }
  };

  publishPosition = () => {
    if (!this.media || this.state.videoError || this.pendingSeek || this.media.seeking) return;
    const { currentRoute, loop, dispatch, seekRevision } = this.props;
    const offset = this.media.currentTime * 1000 + (currentRoute.videoStartOffset || 0);
    if (this.props.desiredPlaySpeed && loop && loop.duration > 0 && offset >= loop.startTime + loop.duration) {
      this.pendingSeek = true;
      dispatch(seek(Math.max(loop.startTime, currentRoute.videoStartOffset || 0)));
      return;
    }
    dispatch(videoProgress(currentRoute.fullname, offset, seekRevision || 0));
  };

  onSeeked = () => {
    if (!this.media || Math.abs(this.media.currentTime - this.seekTarget) > 0.25) return;
    this.pendingSeek = false;
    this.publishPosition();
    if (this.media?.readyState >= 2) this.props.dispatch(bufferVideo(false));
  };

  onReady = (player, route, retry) => {
    if (route !== this.props.currentRoute?.fullname || retry !== this.state.retry || player !== this.videoPlayer.current) return;
    this.detachMedia();
    this.media = player.getInternalPlayer();
    if (!this.media) return;
    const listen = (event, callback, target = this.media) => {
      const media = this.media;
      const listener = () => {
        if (this.media === media && route === this.props.currentRoute?.fullname) callback();
      };
      target.addEventListener(event, listener);
      this.listeners.push([target, event, listener]);
    };
    listen('loadedmetadata', this.seekMedia);
    listen('timeupdate', this.publishPosition);
    listen('seeking', () => this.props.dispatch(bufferVideo(true)));
    listen('waiting', () => this.props.dispatch(bufferVideo(true)));
    listen('seeked', this.onSeeked);
    listen('canplay', () => { if (!this.pendingSeek) this.props.dispatch(bufferVideo(false)); });
    listen('playing', () => {
      if (!this.state.videoError) this.props.dispatch(bufferVideo(false));
    });
    listen('ended', () => {
      this.publishPosition();
      const { loop, currentRoute, dispatch } = this.props;
      const start = Math.max(loop?.startTime || 0, currentRoute.videoStartOffset || 0);
      const end = this.media.duration * 1000 + (currentRoute.videoStartOffset || 0);
      if (loop?.duration > 0 && start < end) {
        if (!this.pendingSeek) dispatch(seek(start));
      } else {
        dispatch(pause());
      }
    });
    const reportAudio = () => {
      if (this.media?.audioTracks?.length) this.props.onAudioStatusChange?.(true);
    };
    listen('loadeddata', reportAudio);
    if (this.media.audioTracks?.addEventListener) listen('addtrack', reportAudio, this.media.audioTracks);
    reportAudio();
    this.hls = player.getInternalPlayer('hls');
    if (this.hls) {
      this.audioListener = (_event, data) => {
        if (route === this.props.currentRoute?.fullname) this.props.onAudioStatusChange?.(Boolean(data.audio));
      };
      this.hls.on('hlsBufferCodecs', this.audioListener);
    }
    this.seekMedia();
    // Clip boundaries need frame precision; regular progress stays at the
    // browser's timeupdate cadence rather than dispatching on every frame.
    const media = this.media;
    const checkLoop = () => {
      if (this.media !== media) return;
      const { loop, currentRoute, desiredPlaySpeed } = this.props;
      if (!this.pendingSeek && !media.seeking && desiredPlaySpeed && loop?.duration > 0
        && media.currentTime * 1000 + (currentRoute.videoStartOffset || 0) >= loop.startTime + loop.duration) {
        this.publishPosition();
      }
      this.frameRequest = media.requestVideoFrameCallback?.(checkLoop) ?? null;
    };
    this.frameRequest = media.requestVideoFrameCallback?.(checkLoop) ?? null;
  };

  onError = (error, data, route, retry) => {
    if (route !== this.props.currentRoute?.fullname || retry !== this.state.retry || error?.name === 'AbortError') return;
    if (error === 'hlsError' && !data?.fatal) return;
    if (error?.name === 'NotAllowedError') {
      this.props.dispatch(pause());
      this.props.dispatch(bufferVideo(false));
      return;
    }
    this.props.dispatch(bufferVideo(false));
    this.setState({ videoError: (data || error)?.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : 'Unable to load video. Check your connection and try again.' });
  };

  retry = () => {
    this.detachMedia();
    this.props.onAudioStatusChange?.(false);
    this.props.dispatch(bufferVideo(true));
    this.setState(({ retry }) => ({ retry: retry + 1, videoError: null }));
  };

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { videoError, retry } = this.state;
    const route = currentRoute?.fullname;
    const src = currentRoute && api.video.getQcameraStreamUrl(route, currentRoute.share_exp, currentRoute.share_sig);
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo && !videoError} error={videoError} />
        {videoError && <button className="absolute z-50 bottom-4 left-1/2 -translate-x-1/2" onClick={this.retry}>Retry video</button>}
        {src && <ReactPlayer
          key={`${route}:${src}:${retry}`}
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(desiredPlaySpeed && !videoError)}
          playbackRate={Math.min(isFirefox() && !isMuted ? 8 : 16, desiredPlaySpeed || 1)}
          onReady={(player) => this.onReady(player, route, retry)}
          onError={(error, data) => this.onError(error, data, route, retry)}
          config={{ hlsVersion: '1.4.8', hlsOptions: { maxBufferLength: 40 } }}
        />}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRevision: state.seekRevision,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
