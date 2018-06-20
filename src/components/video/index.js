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
      bufferTime: 5,
      src: this.videoURL()
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
    this.setState({
      src: this.videoURL()
    });
    if (this.videoPlayer.current) {
      this.videoPlayer.current.load();
    }
  }

  componentDidUpdate (prevProps, prevState) {
    let newUrl = this.videoURL();
    if (this.state.src !== newUrl) {
      this.setState({
        src: newUrl
      });
      if (this.videoPlayer.current) {
        this.videoPlayer.current.load();
      }
    }
  }

  updatePreview () {
    if (!this.mounted) {
      return;
    }
    // schedule next run right away so that we can return early
    raf(this.updatePreview);

    let offset = TimelineWorker.currentOffset();
    let shouldShowPreview = true;
    let bufferTime = this.state.bufferTime;
    let videoPlayer = this.videoPlayer.current;

    if (videoPlayer) {
      let playerState = videoPlayer.getState().player;
      if (!playerState.buffered) {
        return;
      }
      if (this.props.playSpeed && this.props.currentSegment) {
        let curVideoTime = playerState.currentTime;
        let desiredVideoTime = this.currentVideoTime(offset);
        let timeDiff = desiredVideoTime - curVideoTime;

        // console.log('Adjusting time drift by', timeDiff, curVideoTime);
        // console.log(playerState);
        shouldShowPreview = playerState.buffered.length === 0 || playerState.waiting || (Math.abs(timeDiff) > 2);

        if (Number.isFinite(timeDiff) && Math.abs(timeDiff) > 0.25) {

          if (Math.abs(timeDiff) > bufferTime * 1.1) {
            if (desiredVideoTime + this.state.bufferTime * this.props.playSpeed > playerState.duration) {
              // debugger;
              // do nothing, this is a bug
            } else {
              console.log('Seeking!');
              videoPlayer.seek(desiredVideoTime + this.state.bufferTime * this.props.playSpeed);
            }
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
        shouldShowPreview = !this.props.currentSegment || !playerState.buffered.length;
        if (!playerState.paused && !playerState.seeking && playerState.buffered.length) {
          console.log('Pause');
          videoPlayer.pause();
        }
      }
    }
    if (this.imageRef.current) {
      if (shouldShowPreview && this.imageRef.current.src !== this.nearestImageFrame(offset)) {
        this.imageRef.current.src = this.nearestImageFrame(offset);
      }
      this.imageRef.current.style.display = shouldShowPreview ? 'block' : 'none';
    }
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
      <div style={{ position: 'relative' }}>
        <Player
          style={{ zIndex: 1 }}
          ref={ this.videoPlayer }
          autoPlay={ !!this.props.currentSegment }
          muted={ true }
          fluid={ true }
          src={ this.state.src }

          startTime={ this.currentVideoTime() + (this.props.currentSegment ? this.state.bufferTime * this.props.playSpeed : 0) }
          playbackRate={ this.props.playSpeed }
          >
          <HLSSource
            isVideoChild
          />
          <ControlBar autoHide={false}>
            <PlaybackRateMenuButton
              rates={[5, 3, 1.5, 1, 0.5, 0.1]}
              order={7.1}
            />
          </ControlBar>
        </Player>

        <img style={{
          width: '100%',
          height: 'auto',
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
