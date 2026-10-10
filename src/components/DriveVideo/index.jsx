import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import { api } from '../../api/backend';
import * as Types from '../../actions/types';
import { play, pause, bufferVideo } from '../../timeline/playback';
import { createPlayer } from './player';
import { currentOffset } from '../../timeline';

export class DriveVideo extends Component {
  video = React.createRef();
  state = { buffering: true, error: null, blocked: false };

  componentDidMount() { this.load(); }
  componentDidUpdate(previous) {
    if (this.source(previous) !== this.source(this.props)) this.load();
    else this.player?.update({ ...this.props, muted: this.props.isMuted });
    if (previous.showVideo !== this.props.showVideo && this.state.error) this.setOwner();
  }
  componentWillUnmount() { this.release(); }
  source(props) {
    const route = props.currentRoute;
    return route ? api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig) : '';
  }
  setOwner() {
    this.props.dispatch({ type: Types.ACTION_MEDIA_SOURCE, source: this.state.error && this.props.showVideo === false ? null : this.token });
    if (this.state.error && this.props.showVideo === false) this.props.dispatch(bufferVideo(false));
  }
  release() {
    this.token = null;
    this.unbind?.();
    this.player?.destroy();
    this.player = null;
    this.props.dispatch({ type: Types.ACTION_MEDIA_SOURCE, source: null });
  }
  retry = () => {
    const offset = this.props.dispatch((_dispatch, getState) => currentOffset(getState()));
    this.load(offset);
  };
  load = (startOffset = this.props.offset) => {
    this.release();
    const src = this.source(this.props);
    if (!src) return;
    const token = {};
    this.token = token;
    const { dispatch, currentRoute } = this.props;
    dispatch({ type: Types.ACTION_MEDIA_SOURCE, source: token });
    this.props.onAudioStatusChange?.(false);
    this.player = createPlayer(this.video.current, {
      src, route: currentRoute,
      onPause: () => dispatch(pause()),
      onTime: (offset, revision) => dispatch({ type: Types.ACTION_MEDIA_TIME, source: token, revision, offset }),
      onPlaying: (playing) => dispatch({ type: Types.ACTION_MEDIA_PLAYING, source: token, playing }),
      onAudio: (audio) => this.props.onAudioStatusChange?.(audio),
      onStatus: status => {
        if (this.token !== token) return;
        this.setState(status, () => { if (status.error) this.setOwner(); });
        if (status.buffering !== undefined) dispatch(bufferVideo(status.buffering));
      },
    });
    this.unbind = dispatch({ type: Types.ACTION_BIND_MEDIA, player: this.player });
    this.player.update({ ...this.props, seekOffset: startOffset, muted: this.props.isMuted });
  };
  render() {
    const { showVideo = true, isMuted, dispatch } = this.props;
    const { buffering, error, blocked } = this.state;
    return (
      <div className={showVideo ? 'w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]' : 'relative'}>
        <video key={this.source(this.props)} ref={this.video} playsInline muted={isMuted} preload="auto"
          aria-label="Drive video" className={showVideo ? 'w-full h-full' : 'absolute w-px h-px opacity-0 pointer-events-none'} />
        {(error || blocked || (buffering && showVideo)) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#16181AAA]">
            {error ? <><Typography>{error}</Typography><Button onClick={this.retry}>Retry</Button></>
              : blocked ? <Button onClick={() => dispatch(play(this.props.desiredPlaySpeed || 1))}>Play video</Button>
              : <CircularProgress />}
          </div>
        )}
      </div>
    );
  }
}
export default connect(state => ({ currentRoute: state.currentRoute, offset: state.offset,
  desiredPlaySpeed: state.desiredPlaySpeed, loop: state.loop, seekOffset: state.seekOffset,
  seekRevision: state.seekRevision }))(DriveVideo);
