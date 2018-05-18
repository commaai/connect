import React, { Component } from 'react';
import { connect } from 'react-redux'
import raf from 'raf';
import { Player, ControlBar, PlaybackRateMenuButton } from 'video-react';
import HLSSource from './hlsSource';

// CSS for video
import 'video-react/dist/video-react.css';

import TimelineWorker from '../../timeline';

// show video or

class VideoPreview extends Component {
  constructor (props) {
    super(props);

    this.updatePreview = this.updatePreview.bind(this);
    this.imageRef = React.createRef();
    this.videoPlayer = React.createRef();
  }

  componentDidMount () {
    this.mounted = true;
    raf(this.updatePreview);
  }

  componentWillUnmount () {
    this.mounted = false;
  }
  componentDidUpdate(prevProps, prevState) {
    if (!this.props.currentSegment || (this.props.currentSegment.url && !prevProps.currentSegment) || this.props.currentSegment.url !== prevProps.currentSegment.url) {
      this.videoPlayer.current.load();
    }
  }

  updatePreview () {
    if (!this.mounted) {
      return;
    }
    if (this.imageRef.current) {
      this.imageRef.current.src = this.nearestImageFrame();
    }
    raf(this.updatePreview);
  }
  videoURL () {
    if (!this.props.currentSegment) {
      return '';
    }
    return '//video.comma.ai/hls/' + this.props.dongleId + '/' + this.props.currentSegment.url.split('/').pop() + '/index.m3u8';
  }

  // nearest cache-worthy frame of the video
  // always show a frame before the current offset so that data is what happened
  // after this frame was seen, that way you can't see things it hasn't reacted to
  nearestImageFrame (offset = TimelineWorker.currentOffset()) {
    if (!this.props.currentSegment) {
      return '';
    }
    offset = offset - this.props.currentSegment.routeOffset;
    var seconds = Math.floor(offset / 5000) * 5;

    return this.props.currentSegment.url + '/sec' + seconds + '.jpg';
  }

  render () {
    return (
      <div>
        { /* <img ref={ this.imageRef } src={this.nearestImageFrame()} /> */ }

        <Player
          ref={ this.videoPlayer }
          autoPlay
          playbackRate={ this.props.playSpeed }
          >
          <HLSSource
            isVideoChild
            src={ this.videoURL() }
          />
          <ControlBar autoHide={false}>
            <PlaybackRateMenuButton
              rates={[5, 3, 1.5, 1, 0.5, 0.1]}
              order={7.1}
            />
          </ControlBar>
        </Player>
      </div>
    );
  }
}

export default connect(mapStateToProps)(VideoPreview);

function mapStateToProps(state) {
  return state.workerState;
}
