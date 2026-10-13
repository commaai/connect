import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import { api } from '../../api/backend';
import { mirrorPlayback, play } from '../../timeline/playback';
import { ErrorOutline } from '../../icons';
import Colors from '../../colors';
import RoutePlayer from './player';

export class DriveVideo extends Component {
  video = React.createRef();
  state = { loading: false, spinner: false, error: null, tapToPlay: false };
  componentDidMount() { this.mounted = true; this.startSource(); }
  componentDidUpdate(previous) {
    if (this.url(previous) !== this.url(this.props) || previous.currentRoute?.fullname !== this.props.currentRoute?.fullname) {
      this.startSource(previous.currentRoute?.fullname === this.props.currentRoute?.fullname);
    } else if (previous.currentRoute !== this.props.currentRoute || previous.zoom !== this.props.zoom || previous.loop !== this.props.loop) {
      this.player?.update(this.props);
    }
    if (previous.isMuted !== this.props.isMuted) this.player?.setMuted(this.props.isMuted);
  }
  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.spinnerTimer);
    this.player?.dispose();
  }
  url(props) {
    const route = props.currentRoute;
    return route ? api.video.getQcameraStreamUrl(route.fullname, route.share_exp, route.share_sig) : null;
  }
  feedback = (patch) => {
    if (!this.mounted) return;
    clearTimeout(this.spinnerTimer);
    this.setState({ ...patch, spinner: false });
    if (patch.loading) this.spinnerTimer = setTimeout(() => {
      if (this.mounted) this.setState({ spinner: true });
    }, 300);
  };
  startSource = (preserve = true) => {
    if (preserve && this.state.error) this.props.onRetryAssets?.();
    const saved = preserve ? this.player?.snapshot() : null;
    this.player?.dispose();
    const url = this.url(this.props);
    if (!url) return;
    this.feedback({ loading: true, error: null, tapToPlay: false });
    const fullname = this.props.currentRoute.fullname;
    const player = new RoutePlayer(this.video.current, {
      ...this.props, ...saved,
      onFeedback: this.feedback,
      onRetry: () => this.startSource(true),
      onSnapshot: (snapshot) => {
        if (this.mounted && this.player === player && this.props.currentRoute?.fullname === fullname) {
          this.props.dispatch(mirrorPlayback(fullname, snapshot));
        }
      },
    });
    this.player = player;
    player.start(url);
  };
  render() {
    const { hidden, dispatch, playSpeed } = this.props;
    const { error, spinner, tapToPlay } = this.state;
    return (
      <div className={hidden ? 'relative' : 'min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]'}>
        {(error || tapToPlay || spinner) && (
          <div className={`${hidden ? 'relative mb-3' : 'absolute inset-0 z-50'} flex items-center justify-center bg-[#16181AAA] text-center p-4`}>
            <div role={error ? 'alert' : 'status'}>
              {error ? <><ErrorOutline /><Typography>{error}</Typography></> : null}
              {(error || tapToPlay) ? <Button variant="contained" color="primary"
                onClick={() => error ? this.startSource(true) : dispatch(play(playSpeed))}>
                {error ? 'Retry' : 'Tap to play'}
              </Button> : <CircularProgress aria-label="Loading video" style={{ color: Colors.white }} size={40} />}
            </div>
          </div>
        )}
        <video ref={this.video} className="w-full h-full bg-black" playsInline preload="auto"
          aria-hidden={hidden || undefined}
          style={hidden ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' } : undefined} />
      </div>
    );
  }
}
const stateToProps = (state) => ({ currentRoute: state.currentRoute, zoom: state.zoom, loop: state.loop,
  offset: state.offset, playRequested: state.playRequested, playSpeed: state.playSpeed });
export default connect(stateToProps)(DriveVideo);
