// https://video-react.js.org/customize/customize-source/
import React, { Component } from 'react';
import Hls from 'hls.js';

export default class HLSSource extends Component {
  constructor(props, context) {
    super(props, context);
    this.hls = new Hls();
  }

  componentDidUpdate (prevProps, prevState) {
    if (this.props.src !== prevProps.src || this.props.video !== prevProps.video) {
      this.initHls();
    }
  }
  componentWillMount() {
    this.initHls();
  }

  initHls () {
    // `src` is the property get from this component
    // `video` is the property insert from `Video` component
    // `video` is the html5 video element
    const { src, video } = this.props;

    // load hls video source base on hls.js
    if (Hls.isSupported()) {
      // if (this.hls) {
      //   this.hls.destroy();
      // }
      // this.hls = new Hls();
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
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
