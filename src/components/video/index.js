import React, { Component } from 'react';
import { connect } from 'react-redux'
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import { Player, ControlBar, PlaybackRateMenuButton } from 'video-react';
import classNames from '@sindresorhus/class-names';
// CSS for video
import 'video-react/dist/video-react.css';

import HLSSource from './hlsSource';

import TimelineWorker from '../../timeline';

const styles = theme => {
  return {
    root: {},
    hidden: {
      display: 'none'
    }
  }
};

class VideoPreview extends Component {
  constructor (props) {
    super(props);

    this.updatePreview = this.updatePreview.bind(this);
    this.imageRef = React.createRef();
    this.videoPlayer = React.createRef();

    this.state = {
      bufferTime: 4,
      src: this.videoURL(),
      noVideo: false
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
    let noVideo = this.state.noVideo;

    if (videoPlayer) {
      let playerState = videoPlayer.getState().player;
      if (!playerState.buffered || Number.isNaN(playerState.duration)) {
        return;
      }
      if (this.props.playSpeed && this.props.currentSegment) {
        let curVideoTime = playerState.currentTime;
        let desiredVideoTime = this.currentVideoTime(offset);
        let timeDiff = desiredVideoTime - curVideoTime;

        let isBuffered = false;
        for (let i = 0, buf = playerState.buffered, len = buf.length; i < len; ++i) {
          let start = buf.start(i);
          if (start < desiredVideoTime && buf.end(i) > desiredVideoTime) {
            isBuffered = true;
            break;
          } else if (Math.abs(start - desiredVideoTime) < 5) {
            isBuffered = true;
            break;
          }
        }

        // console.log('Adjusting time drift by', timeDiff, curVideoTime);
        // console.log(playerState);
        shouldShowPreview = playerState.buffered.length === 0 || playerState.waiting || (Math.abs(timeDiff) > 2);

        if (Number.isFinite(timeDiff) && Math.abs(timeDiff) > 0.25) {

          if (Math.abs(timeDiff) > bufferTime * 1.1 || (Math.abs(timeDiff) > 0.5 && isBuffered)) {
            if (desiredVideoTime > playerState.duration) {
              noVideo = true;
            } else if (desiredVideoTime < 0) {
              noVideo = true;
            } else {
              noVideo = false;
              console.log('Seeking!', desiredVideoTime);
              // debugger;
              if (isBuffered) {
                videoPlayer.seek(desiredVideoTime);
              } else {
                console.log(playerState, desiredVideoTime);
                videoPlayer.seek(desiredVideoTime + this.state.bufferTime * this.props.playSpeed);
              }
            }
          } else {
            if (timeDiff > 0) {
              timeDiff = Math.min(1, timeDiff);
            } else {
              timeDiff = Math.max(0.25, timeDiff + this.props.playSpeed) - this.props.playSpeed;
            }
            videoPlayer.playbackRate = (this.props.playSpeed + timeDiff);
            noVideo = false;
          }
        } else {
          noVideo = false;
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
    if (noVideo !== this.state.noVideo) {
      this.setState({
        noVideo
      });
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
        <div className={ classNames({
          [this.props.classes.hidden]: this.state.noVideo
        }) }>
          <Player
            style={{ zIndex: 1 }}
            ref={ this.videoPlayer }
            autoPlay={ !!this.props.currentSegment }
            muted={ true }
            fluid={ true }
            src={ this.state.src }

            startTime={ this.currentVideoTime() }
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
      </div>
    );
  }
}

function mapStateToProps(state) {
  return state.workerState;
}

export default connect(mapStateToProps)(withStyles(styles)(VideoPreview));
