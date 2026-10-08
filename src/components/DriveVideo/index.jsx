import React, { Component } from 'react';
import { connect } from 'react-redux';
import { api } from '../../api/backend';
import { createController, bindMedia } from '../../timeline/media';
import { mediaSource, progress, pause, play, seek, bufferVideo } from '../../timeline/playback';
import { attachSource } from './transport';
import VideoStatus from './VideoStatus';
import { createVideoMapping, mediaToRoute, routeToMedia } from '../../timeline/videoTime';

export class DriveVideo extends Component {
  video = React.createRef();
  state = { loading: true, error: null, blocked: false };

  componentDidMount() {
    this.changeSource();
  }

  componentDidUpdate(previous) {
    if (this.sourceKey(previous) !== this.sourceKey(this.props)) this.changeSource();
    else if (previous.seekRevision !== this.props.seekRevision || previous.desiredPlaySpeed !== this.props.desiredPlaySpeed
      || previous.isMuted !== this.props.isMuted || previous.loop !== this.props.loop
      || previous.currentRoute !== this.props.currentRoute) this.updateIntent();
  }

  componentWillUnmount() {
    this.release();
  }

  sourceKey(props) {
    const route = props.currentRoute;
    return route ? `${route.fullname}|${route.share_exp || ''}|${route.share_sig || ''}` : null;
  }

  release() {
    this.sourceToken = null;
    this.unbind?.();
    this.controller?.dispose();
    this.transport?.destroy();
    this.unbind = null;
    this.controller = null;
    this.transport = null;
    this.entries = null;
    this.observedRevision = null;
    this.bufferStart = undefined;
  }

  changeSource(startOffset) {
    this.release();
    const { currentRoute, dispatch, onAudioStatusChange } = this.props;
    if (!currentRoute) return;
    const token = {};
    this.sourceToken = token;
    const active = () => this.sourceToken === token;
    dispatch(mediaSource(token));
    const rangeStart = this.props.loop?.startTime ?? this.props.zoom?.start ?? 0;
    dispatch(seek(startOffset ?? rangeStart));
    onAudioStatusChange?.(false);
    const controller = createController(this.video.current, {
      routeId: currentRoute.fullname,
      onProgress: (offset, revision) => {
        if (!active()) return;
        this.observedRevision = revision;
        dispatch(progress(token, revision, offset));
      },
      onPause: () => { if (active()) dispatch(pause()); },
      onStatus: ({ buffering, blocked, error }) => {
        if (!active()) return;
        if (buffering !== undefined) dispatch(bufferVideo(buffering));
        if (blocked) this.transport?.reportError({ name: 'NotAllowedError' });
        else if (error) this.transport?.reportError(error);
      },
    });
    this.controller = controller;
    this.transport = attachSource(this.video.current, {
      src: api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig),
      onStatus: (status) => { if (active()) this.setState(status); },
      onReady: ({ bufferStart } = {}) => {
        if (!active()) return;
        if (Number.isFinite(bufferStart) && bufferStart >= 0) this.bufferStart = bufferStart;
        this.updateIntent();
      },
      onAudio: (hasAudio) => { if (active()) this.props.onAudioStatusChange?.(hasAudio); },
      onTimeline: (entries) => {
        if (!active()) return;
        const video = this.video.current;
        const previousMapping = createVideoMapping(this.props.currentRoute, this.entries);
        const offset = previousMapping && video.readyState >= 1 && !video.seeking
          && this.observedRevision === this.props.seekRevision
          ? mediaToRoute(previousMapping, video.currentTime) : this.props.seekOffset;
        this.entries = entries;
        this.updateIntent();
        if (createVideoMapping(this.props.currentRoute, entries) && Number.isFinite(offset)) dispatch(seek(offset));
      },
    });
    this.updateIntent();
    this.unbind = dispatch(bindMedia(controller));
  }

  updateIntent() {
    const { desiredPlaySpeed, isMuted, loop, zoom, seekRevision, seekOffset, currentRoute } = this.props;
    const mapping = createVideoMapping(currentRoute, this.entries);
    const range = loop ? { start: loop.startTime, end: loop.startTime + loop.duration } : zoom;
    this.controller?.update({ speed: desiredPlaySpeed, muted: isMuted, range,
      seekRevision, seekOffset, waitForBuffer: true, bufferStart: this.bufferStart,
      toMedia: (offset) => mapping ? routeToMedia(mapping, offset) : null,
      toRoute: (seconds) => mapping ? mediaToRoute(mapping, seconds) : null,
      videoStartOffset: currentRoute?.videoStartOffset ?? 0 });
  }

  retry = () => {
    const route = this.props.currentRoute;
    if (!route || !this.transport) return;
    const mapping = createVideoMapping(route, this.entries);
    const seconds = this.video.current.currentTime;
    const observed = mapping && !this.video.current.seeking
      && this.observedRevision === this.props.seekRevision;
    const offset = observed ? mediaToRoute(mapping, seconds) : this.props.seekOffset;
    // Unknown timing cannot supply a guessed position. Retain the last command.
    this.changeSource(Number.isFinite(offset) ? offset : undefined);
  };

  render() {
    const { showVideo = true, isMuted, dispatch } = this.props;
    return (
      <div className={showVideo ? 'relative max-w-[964px] m-[0_auto] aspect-[1.593]' : 'relative'}>
        <video ref={this.video} playsInline muted={isMuted} preload="auto"
          aria-label="Drive video" aria-hidden={!showVideo}
          className={showVideo ? 'w-full h-full' : 'absolute w-px h-px opacity-0 pointer-events-none'} />
        <VideoStatus {...this.state} onRetry={this.retry}
          onPlay={() => dispatch(play(this.props.desiredPlaySpeed || 1))} />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute, desiredPlaySpeed: state.desiredPlaySpeed,
  loop: state.loop, zoom: state.zoom, seekRevision: state.seekRevision, seekOffset: state.seekOffset,
});
export default connect(stateToProps)(DriveVideo);
