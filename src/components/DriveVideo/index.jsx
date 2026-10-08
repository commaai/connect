/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import { ErrorOutline } from '../../icons';
import { seek, bufferVideo, pause } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';
import { isIos } from '../../utils/browser.js';
import { routeOffsetForVideoSeconds, videoSecondsForOffset } from './time';

const EXTERNAL_SEEK_TOLERANCE_MS = 250;

const VideoOverlay = ({ buffering, error, onRetry, route }) => (
  <>
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-3 text-[10px] font-semibold tracking-[0.18em] text-white/70 sm:px-5 sm:py-4">
      <span>DRIVE CAMERA</span>
      {route && <span>SEGMENT {getSegmentNumber(route) ?? '—'}</span>}
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
    {buffering && !error && (
      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white shadow-[0_0_24px_rgba(255,255,255,0.35)]" />
      </div>
    )}
    {error && (
      <div className="absolute inset-0 z-30 grid place-items-center bg-[#090c0f]/80 p-5 backdrop-blur-sm">
        <div className="max-w-sm rounded-2xl border border-white/10 bg-[#161c21]/95 px-6 py-5 text-center shadow-2xl">
          <ErrorOutline className="mb-3 text-red-300" />
          <p className="m-0 text-sm font-medium text-white">Playback unavailable</p>
          <p className="mb-4 mt-1 text-xs leading-5 text-white/60">{error}</p>
          <button
            type="button"
            className="rounded-full border border-white/20 bg-white px-4 py-2 text-xs font-bold text-[#11171b] transition hover:bg-white/85 focus:outline-none focus:ring-2 focus:ring-white/80"
            onClick={onRetry}
          >
            Try again
          </button>
        </div>
      </div>
    )}
  </>
);

class DriveVideo extends Component {
  constructor(props) {
    super(props);
    this.videoPlayer = React.createRef();
    this.lastVideoOffset = null;
    this.lastPlayedSeconds = null;
    this.state = { error: null, retry: 0 };

    this.handleProgress = this.handleProgress.bind(this);
    this.handleReady = this.handleReady.bind(this);
    this.handleBuffer = this.handleBuffer.bind(this);
    this.handleError = this.handleError.bind(this);
    this.retry = this.retry.bind(this);
  }

  componentDidUpdate(prevProps) {
    const routeChanged = prevProps.currentRoute?.fullname !== this.props.currentRoute?.fullname;
    if (routeChanged) {
      this.lastVideoOffset = null;
      this.lastPlayedSeconds = null;
      if (this.state.error) this.setState({ error: null });
      return;
    }

    // Timeline, keyboard and button seeks are authoritative user requests. A
    // progress event records lastVideoOffset before dispatching, preventing the
    // reflected Redux update from seeking the media element back to itself.
    if (prevProps.offset !== this.props.offset
      && this.lastVideoOffset !== null
      && Math.abs(this.props.offset - this.lastVideoOffset) > EXTERNAL_SEEK_TOLERANCE_MS) {
      this.seekToOffset(this.props.offset);
    }
  }

  componentWillUnmount() {
    this.lastVideoOffset = null;
    this.lastPlayedSeconds = null;
  }

  seekToOffset(offset) {
    if (this.videoPlayer.current && this.props.currentRoute) {
      this.videoPlayer.current.seekTo(videoSecondsForOffset(this.props.currentRoute, offset), 'seconds');
    }
  }

  hasPlayableFrame() {
    const media = this.videoPlayer.current?.getInternalPlayer();
    return Boolean(media && media.readyState >= 2);
  }

  handleProgress({ playedSeconds }) {
    const { currentRoute, desiredPlaySpeed, dispatch, loop } = this.props;
    if (!currentRoute || !this.hasPlayableFrame()) return;

    const mediaAdvanced = this.lastPlayedSeconds !== null
      && Math.abs(playedSeconds - this.lastPlayedSeconds) > 0.001;
    this.lastPlayedSeconds = playedSeconds;

    let offset = routeOffsetForVideoSeconds(currentRoute, playedSeconds);
    if (loop && (offset < loop.startTime || offset >= loop.startTime + loop.duration)) {
      offset = loop.startTime;
      this.seekToOffset(offset);
    }

    this.lastVideoOffset = offset;
    dispatch(seek(offset));
    if (mediaAdvanced || !desiredPlaySpeed) dispatch(bufferVideo(false));
  }

  handleReady(player) {
    this.seekToOffset(this.props.offset);
    if (!this.props.desiredPlaySpeed) this.props.dispatch(bufferVideo(false));

    const reportAudio = this.props.onAudioStatusChange;
    if (!reportAudio) return;

    if (isIos()) {
      const element = player.getInternalPlayer();
      reportAudio(Boolean(element?.audioTracks?.length));
      return;
    }

    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => reportAudio(Boolean(data.audio)));
    }
  }

  handleBuffer() {
    this.props.dispatch(bufferVideo(true));
  }

  handleError(error, data) {
    if (!error || error.name === 'AbortError') return;
    if (error === 'hlsError' && !data?.fatal) return;

    if (error.name === 'NotAllowedError') {
      this.props.dispatch(pause());
      return;
    }

    this.props.dispatch(bufferVideo(false));
    const message = data?.response?.code === 404 || error?.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (data?.reason || data?.details || data?.response?.text || error?.message || 'Check your connection and try again.');
    this.setState({ error: message });
  }

  retry() {
    this.lastVideoOffset = null;
    this.lastPlayedSeconds = null;
    this.setState((state) => ({ error: null, retry: state.retry + 1 }));
    this.props.dispatch(bufferVideo(true));
  }

  render() {
    const { currentRoute, desiredPlaySpeed, isBufferingVideo, isMuted } = this.props;
    const { error, retry } = this.state;
    const source = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : null;

    return (
      <div className="relative mx-auto aspect-[1.593] min-h-[200px] max-w-[964px] overflow-hidden rounded-[22px] bg-[#090c0f] ring-1 ring-white/10 shadow-[0_20px_55px_rgba(0,0,0,0.42)]">
        <VideoOverlay buffering={isBufferingVideo} error={error} onRetry={this.retry} route={currentRoute} />
        <ReactPlayer
          key={`${currentRoute?.fullname || 'empty'}-${retry}`}
          ref={this.videoPlayer}
          url={source}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          playbackRate={desiredPlaySpeed || 1}
          progressInterval={100}
          onReady={this.handleReady}
          onProgress={this.handleProgress}
          onBuffer={this.handleBuffer}
          onError={this.handleError}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40 },
          }}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  offset: state.offset,
  loop: state.loop,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
