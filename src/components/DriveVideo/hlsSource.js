// https://video-react.js.org/customize/customize-source/
import React, { Component } from 'react';
import Hls from 'hls.js';

export default class HLSSource extends Component {
  constructor(props, context) {
    super(props, context);
    this.hls = new Hls();
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

  componentDidMount() {
    this.setState({
      src: this.props.src
    });
  }

  componentWillUpdate(nextProps, nextState) {
    if (nextProps.src !== nextState.src) {
      // console.log('Loading media source!', nextProps.src);
      if (this.state.src.length) {
        // console.log('this.hls.detachMedia();');
        this.hls.detachMedia();
      }
      this.setState({
        src: nextProps.src
      });
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.src !== prevState.src && this.state.src.length) {
      // console.log('this.hls.loadSource(this.state.src);');
      this.hls.loadSource(this.state.src);
      // console.log('this.hls.attachMedia(this.props.video);');
      this.hls.attachMedia(this.props.video);

      if (this.props.onSourceLoaded) {
        this.props.onSourceLoaded();
      }
    }
  }

  componentWillUnmount() {
    // destroy hls video source
    if (this.hls) {
      // console.log('this.hls.destroy();');
      this.hls.destroy();
    }
  }

  render() {
    return (
      <source src={this.state.src} type={this.props.type || 'application/x-mpegURL'} />
    );
  }
}
