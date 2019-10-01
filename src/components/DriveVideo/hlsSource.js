// https://video-react.js.org/customize/customize-source/
import React, { Component } from 'react';
import Hls from '@commaai/hls.js';

export default class HLSSource extends Component {
  constructor(props, context) {
    super(props, context);
    this.hls = new Hls({disablePtsDtsCorrectionInMp4Remux: true});
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.props.video.play();
    });
    this.hls.on(Hls.Events.BUFFER_APPENDED, (eventName, data) => {
      if (this.props.onBufferAppend) {
        this.props.onBufferAppend();
      }
    });

    this.state = {
      src: ''
    };
    // this.hls.on(Hls.Events.STREAM_STATE_TRANSITION, (eventName, data) => {
    // });
  }

  componentDidMount () {
    this.componentDidUpdate({});
  }

  componentDidUpdate (prevProps) {
    if (this.props.src !== this.state.src && this.props.src.length) {
      console.log('Loading media source!', this.props.src);
      if (this.state.src.length) {
        this.hls.detachMedia();
      }
      this.setState({
        src: this.props.src
      }, () => {
        this.hls.loadSource(this.state.src);
        this.hls.attachMedia(this.props.video);

        if (this.props.onSourceLoaded) {
          this.props.onSourceLoaded();
        }
      });
    }
  }

  componentWillUnmount() {
    // destroy hls video source
    if (this.hls) {
      this.hls.destroy();
    }
  }

  render() {
    return (
      <source src={this.state.src} type={this.props.type || 'application/x-mpegURL'} />
    );
  }
}
