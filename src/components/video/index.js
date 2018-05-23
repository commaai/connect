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

    this.state = {
      bufferTime: 5
    };
  }

  componentDidMount () {
    this.mounted = true;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = this.props.playSpeed || 1;
    }

    raf(this.updatePreview);
  }
  componentWillUnmount () {
    this.mounted = false;
  }

  componentDidUpdate (prevProps, prevState) {
    if (this.videoPlayer.current) {
      if (this.props.playSpeed !== prevProps.playSpeed) {
        this.videoPlayer.current.playbackRate = this.props.playSpeed;
      }
    }
  }

  updatePreview () {
    if (!this.mounted) {
      return;
    }
    let offset = TimelineWorker.currentOffset();
    let shouldShowPreview = true;
    let bufferTime = this.state.bufferTime;
    let videoPlayer = this.videoPlayer.current;

    if (videoPlayer) {
      let playerState = videoPlayer.getState().player;
      if (this.props.playSpeed && this.props.currentSegment) {
        let curVideoTime = playerState.currentTime;
        let desiredVideoTime = this.currentVideoTime(offset);
        let timeDiff = desiredVideoTime - curVideoTime;

        console.log('Adjusting time drift by', timeDiff, curVideoTime);
        // console.log(playerState);
        shouldShowPreview = playerState.buffered.length === 0 || playerState.waiting || (Math.abs(timeDiff) > 2);

        if (Number.isFinite(timeDiff) && Math.abs(timeDiff) > 0.25) {

          if (Math.abs(timeDiff) > bufferTime * 1.1) {
            console.log('Seeking!');
            this.setState({
              ...this.state,
              bufferTime: Math.min(10, this.state.bufferTime * 1.5)
            });
            videoPlayer.seek(desiredVideoTime + this.state.bufferTime);
          } else {
            if (timeDiff > 0) {
              timeDiff = Math.min(1, timeDiff);
            } else {
              timeDiff = Math.max(0.25, timeDiff + this.props.playSpeed) - this.props.playSpeed;
            }
            videoPlayer.playbackRate = (this.props.playSpeed + timeDiff);
          }
        } else {
          videoPlayer.playbackRate = this.props.playSpeed;
        }

        if (this.props.currentSegment && playerState.paused && !playerState.seeking) {
          console.log('Play');
          videoPlayer.play();
        }
      } else {
        if (!playerState.paused && !playerState.seeking && playerState.buffered.length) {
          console.log('Pause');
          videoPlayer.pause();
        }
      }
    }
    if (this.imageRef.current) {
      if (shouldShowPreview) {
        this.imageRef.current.src = this.nearestImageFrame(offset);
      }
      this.imageRef.current.style.display = shouldShowPreview ? 'block' : 'none';
    }

    raf(this.updatePreview);
  }
  videoURL () {
    let segment = this.props.currentSegment || this.props.nextSegment;
    if (!segment) {
      return '';
    }
    return '//video.comma.ai/hls/' + this.props.dongleId + '/' + segment.url.split('/').pop() + '/index.m3u8';
  }

  currentVideoTime (offset = TimelineWorker.currentOffset()) {
    if (!this.props.currentSegment) {
      return 0;
    }
    offset = offset - this.props.currentSegment.routeOffset;

    return offset / 1000;
  }

  // nearest cache-worthy frame of the video
  // always show a frame before the current offset so that data is what happened
  // after this frame was seen, that way you can't see things it hasn't reacted to
  nearestImageFrame (offset = TimelineWorker.currentOffset()) {
    let segment = this.props.currentSegment || this.props.nextSegment;
    if (!segment) {
      return '';
    }
    offset = offset - segment.routeOffset;
    var seconds = Math.max(1, Math.floor(offset / 1000) * 1);

    return segment.url + '/sec' + seconds + '.jpg';
  }

  render () {
    return (
      <div>
        <Player
          style={{ zIndex: 1 }}
          ref={ this.videoPlayer }
          autoPlay={ !!this.props.currentSegment }
          muted={ true }
          fluid={ false }
          width={ 638 }
          height={ 480 }

          startTime={ this.currentVideoTime() + (this.props.currentSegment ? this.state.bufferTime : 0) }
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

        <img style={{
          width: 638,
          height: 480,
          position: 'absolute',
          top: 0,
          zIndex: 1
        }} ref={ this.imageRef } src={this.nearestImageFrame()} />
      </div>
    );
  }
}

export default connect(mapStateToProps)(VideoPreview);

function mapStateToProps(state) {
  return state.workerState;
}
