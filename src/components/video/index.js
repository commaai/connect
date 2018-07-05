import React, { Component } from 'react';
import { connect } from 'react-redux'
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import classNames from '@sindresorhus/class-names';

import { Player, ControlBar, PlaybackRateMenuButton } from 'video-react';
import Measure from 'react-measure';
// CSS for video
import 'video-react/dist/video-react.css';

import HLSSource from './hlsSource';

import TimelineWorker from '../../timeline';

const styles = theme => {
  return {
    root: {},
    hidden: {
      display: 'none'
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    }
  }
};

class VideoPreview extends Component {
  constructor (props) {
    super(props);

    this.updatePreview = this.updatePreview.bind(this);
    this.imageRef = React.createRef();
    this.videoPlayer = React.createRef();
    this.canvas = React.createRef();

    this.intrinsic = intrinsicMatrix();

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

    this.renderCanvas();

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
      this.imageRef.current.style.opacity = shouldShowPreview ? 1 : 0;
    }
    if (noVideo !== this.state.noVideo) {
      this.setState({
        noVideo
      });
    }
  }
  renderCanvas () {
    if (!this.imageRef.current || !this.canvas.current) {
      return;
    }
    if (this.imageRef.current.height === 0) {
      return;
    }
    var { width, height } = this.canvas.current.getBoundingClientRect();
    var calibration = TimelineWorker.getCalibration(this.props.route);
    if (!calibration) {
      let ctx = this.canvas.current.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      return; // loading calibration from logs still...
    }
    let model = TimelineWorker.currentModel();
    let modelLogTime = model ? model.LogMonoTime : null;
    if (!model) {
      if (this.lastModelMonoTime) {
        this.lastModelMonoTime = false;
        this.lastLive20MonoTime = false;
        let ctx = this.canvas.current.getContext('2d');
        ctx.clearRect(0, 0, width, height);
      }
    }
    let live20 = TimelineWorker.currentLive20();
    let live20LogTime = model ? model.LogMonoTime : null;
    if (!live20) {
      if (this.lastLive20MonoTime) {
        this.lastModelMonoTime = false;
        this.lastLive20MonoTime = false;
        let ctx = this.canvas.current.getContext('2d');
        ctx.clearRect(0, 0, width, height);
      }
    }
    if (this.lastModelMonoTime === modelLogTime && this.lastLive20MonoTime === live20LogTime) {
      return;
    }
    // will render!
    this.extrinsic = [...calibration.LiveCalibration.ExtrinsicMatrix, 0, 0, 0, 1];

    this.canvas.current.width = width;
    this.canvas.current.height = height;
    var ctx = this.canvas.current.getContext('2d');
    // reset transform before anything, just in case
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // clear all the data
    ctx.clearRect(0, 0, width, height);
    // scale original coords onto our current size
    ctx.scale(width / 1164, height / 874);

    if (model) {
      this.renderLaneLines({ width, height, ctx }, model);
    }
    if (live20) {
      this.renderLeadCars({ width, height, ctx }, live20);
    }
  }
  renderLeadCars (options, live20) {
    this.lastLive20MonoTime = live20.LogMonoTime;
    var { width, height, ctx } = options;

    var leadOne = live20.Live20.LeadOne;
    var leadTwo = live20.Live20.LeadTwo;

    if (leadOne.Status) {
      this.renderLeadCar(options, leadOne);
    }
    if (leadTwo.Status) {
      this.renderLeadCar(options, leadTwo);
    }
  }
  renderLeadCar (options, leadData) {
    var { width, height, ctx } = options;

    var drel = leadData.DRel;
    var vrel = leadData.VRel;
    var yrel = leadData.YRel;

    var x = drel + 2.7;
    var y = yrel;

    var [x, y, z] = this.carSpaceToImageSpace([drel + 2.7, yrel, 0, 1]);

    var sz = 25 * 30;
    sz /= ((drel + 2.7) / 3 + 30);
    sz = Math.min(Math.max(sz, 15), 30);

    ctx.fillStyle = 'white';
    ctx.fillRect(x - sz/2, y - sz/2, sz, sz);
  }
  renderLaneLines (options, model) {
    this.lastModelMonoTime = model.LogMonoTime;
    var { width, height, ctx } = options;

    ctx.lineWidth = 5;
    ctx.strokeStyle = 'green';
    this.drawLine(ctx, model.Model.LeftLane.Points, 0.025 * model.Model.LeftLane.Prob);
    this.drawLine(ctx, model.Model.RightLane.Points, 0.025 * model.Model.RightLane.Prob);

    // colors for ghost/accuracy lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 8;
    this.drawLine(ctx, model.Model.LeftLane.Points, model.Model.LeftLane.Std);
    this.drawLine(ctx, model.Model.LeftLane.Points, 0 - model.Model.LeftLane.Std);

    this.drawLine(ctx, model.Model.RightLane.Points, model.Model.RightLane.Std);
    this.drawLine(ctx, model.Model.RightLane.Points, 0 - model.Model.RightLane.Std);

    ctx.strokeStyle = 'purple';
    ctx.lineWidth = 5 * 1 / model.Model.Path.Prob;
    this.drawLine(ctx, model.Model.Path.Points, 0);
  }
  drawLine (ctx, points, std) {
    std = Math.min(std, 0.7);
    ctx.beginPath();
    var isFirst = true;
    points.forEach((val, i) => {
      var [x, y, z] = this.carSpaceToImageSpace([i, val - std, 0, 1]);
      if (x < 0 && y < 0) {
        return;
      }
      if (isFirst) {
        isFirst = false;
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }
  carSpaceToImageSpace (coords) {
    this.matmul(this.extrinsic, coords);
    this.matmul(this.intrinsic, coords);

    // project onto 3d with Z
    coords[0] /= coords[2];
    coords[1] /= coords[2];

    return coords;
  }
  matmul (matrix, coord) {
    let b0 = coord[0], b1 = coord[1], b2 = coord[2], b3 = coord[3];

    coord[0] = b0 * matrix[0]  + b1 * matrix[1]  + b2 * matrix[2]  + b3 * matrix[3];
    coord[1] = b0 * matrix[4]  + b1 * matrix[5]  + b2 * matrix[6]  + b3 * matrix[7];
    coord[2] = b0 * matrix[8]  + b1 * matrix[9]  + b2 * matrix[10] + b3 * matrix[11];
    coord[3] = b0 * matrix[12] + b1 * matrix[13] + b2 * matrix[14] + b3 * matrix[15];

    return coord;
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
          [this.props.classes.hidden]: false // this.state.noVideo
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
            <ControlBar disabled />
          </Player>

          <img style={{
            width: '100%',
            height: 'auto',
            position: 'absolute',
            top: 0,
            zIndex: 1
          }} ref={ this.imageRef } src={this.nearestImageFrame()} />
          <canvas ref={ this.canvas } className={ this.props.classes.canvas } style={{
            zIndex: 2
          }} />
        </div>
      </div>
    );
  }
}

function intrinsicMatrix () {
  return [
    950.892854,   0,        584,  0,
    0,          950.892854, 439,  0,
    0,            0,        1,    0,
    0,            0,        0,    0,
  ];
}

function mapStateToProps(state) {
  return state.workerState;
}

export default connect(mapStateToProps)(withStyles(styles)(VideoPreview));
