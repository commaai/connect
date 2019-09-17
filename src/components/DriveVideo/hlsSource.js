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
    // this.hls.on(Hls.Events.STREAM_STATE_TRANSITION, (eventName, data) => {
    // });
  }

  componentWillUpdate (nextProps, nextState) {
    if (this.props.src !== nextProps.src || this.props.video !== nextProps.video) {
      this.initHls(nextProps);
    }
  }
  componentDidUpdate (prevProps) {
    if (this.props.src !== prevProps.src || this.props.video !== prevProps.video) {
      // this.initHls(this.props);
      this.hls.attachMedia(this.props.video);
    }
  }
  componentDidMount() {
    // this.initHls();
  }

  initHls (props) {
    // `src` is the property get from this component
    // `video` is the property insert from `Video` component
    // `video` is the html5 video element
    const { src, video } = props;

    // load hls video source base on hls.js
    console.log(src);
    if (Hls.isSupported()) {
      if (this.hls) {
        this.hls.detachMedia();
        // this.hls.destroy();
      }
      // this.hls = new Hls({disablePtsDtsCorrectionInMp4Remux: true});
      // this.hls = new Hls();
      this.hls.loadSource(src);
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
      <source src={this.props.src} type={this.props.type || 'application/x-mpegURL'} />
    );
  }
}
