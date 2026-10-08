import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, Typography } from '@material-ui/core';

import store from '../../store';
import { ErrorOutline } from '../../icons';
import { TransportController } from '../../timeline/transport';

const overlayClass = 'z-50 absolute h-full w-full flex items-center justify-center';

const LoadingOverlay = () => (
  <div className={`${overlayClass} bg-[#16181AD9]`}>
    <div className="flex flex-col items-center gap-5">
      <div className="w-44 h-[3px] rounded-full overflow-hidden bg-white/10">
        <div className="h-full w-2/5 rounded-full bg-white/70 animate-shimmer" />
      </div>
      <span className="text-[11px] tracking-[0.25em] text-white/50">LOADING</span>
    </div>
  </div>
);

const ErrorOverlay = ({ message, onRetry }) => (
  <div className={`${overlayClass} bg-[#16181AF2]`}>
    <div className="flex flex-col items-center px-10 text-center">
      <ErrorOutline className="mb-3 text-white/60" style={{ fontSize: 44 }} />
      <Typography className="mb-6 text-white/90">{message}</Typography>
      <Button variant="outlined" color="default" onClick={onRetry}>
        Retry
      </Button>
    </div>
  </div>
);

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.videoRef = React.createRef();
    this.controller = null;
    this.handleRetry = this.handleRetry.bind(this);
  }

  componentDidMount() {
    const { isMuted, onAudioStatusChange } = this.props;
    const video = this.videoRef.current;
    video.muted = isMuted;
    this.controller = new TransportController(video, store, { onAudioStatusChange });
  }

  componentDidUpdate(prevProps) {
    const { isMuted } = this.props;
    if (prevProps.isMuted !== isMuted && this.videoRef.current) {
      this.videoRef.current.muted = isMuted;
    }
  }

  componentWillUnmount() {
    if (this.controller) {
      this.controller.destroy();
      this.controller = null;
    }
  }

  handleRetry() {
    if (this.controller) {
      this.controller.retry();
    }
  }

  render() {
    const { isBufferingVideo, isSeekingVideo, videoError } = this.props;

    let overlay = null;
    if (videoError) {
      overlay = <ErrorOverlay message={videoError} onRetry={this.handleRetry} />;
    } else if (isBufferingVideo) {
      overlay = <LoadingOverlay />;
    }

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        {overlay}
        <video
          ref={this.videoRef}
          className={`w-full h-full transition-opacity duration-150 ${isSeekingVideo ? 'opacity-75' : ''}`}
          playsInline
          preload="auto"
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  isBufferingVideo: state.isBufferingVideo,
  isSeekingVideo: state.isSeekingVideo,
  videoError: state.videoError,
});

export default connect(stateToProps)(DriveVideo);
