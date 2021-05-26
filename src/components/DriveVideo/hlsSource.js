import React, { Component } from 'react';
import Hls from '@commaai/hls.js';

export default class HLSSource extends Component {
  constructor(props) {
    super(props);
    this.state = {};

    this.hls = new Hls({
      enableWorker: false,
      disablePtsDtsCorrectionInMp4Remux: false
    });

    this.hls.on(Hls.Events.BUFFER_APPENDED, (eventName, data) => {
      if (this.props.onBufferAppend) {
        this.props.onBufferAppend();
      }
    });

    this.hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
          // try to recover network error
            console.log('fatal network error encountered, try to recover');
            this.hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('fatal media error encountered, try to recover');
            this.hls.recoverMediaError();
            break;
          default:
          // cannot recover
            this.hls.destroy();
            this.hls = null;
            break;
        }
      }
    });

    // this.hls.on(Hls.Events.STREAM_STATE_TRANSITION, (eventName, data) => {
    // });
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    if (this.props.src !== prevProps.src) {
      if (prevProps.src) {
        this.hls.detachMedia();
      }
      if (this.props.src) {
        this.hls.loadSource(this.props.src);
        this.hls.attachMedia(this.props.video.current);

        if (this.props.onSourceLoaded) {
          this.props.onSourceLoaded();
        }
      }
    }
  }

  componentWillUnmount() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  render() {
    return (
      <source src={this.props.src} type={this.props.type || 'application/x-mpegURL'} />
    );
  }
}
