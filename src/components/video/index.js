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
    this.canvas_lines = React.createRef();
    this.canvas_lead = React.createRef();
    this.canvas_mpc = React.createRef();
    this.canvas_carstate = React.createRef();

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
    let playSpeed = this.props.startTime < Date.now() ? this.props.playSpeed : 0;

    if (videoPlayer) {
      let playerState = videoPlayer.getState().player;
      if (!playerState.buffered || Number.isNaN(playerState.duration)) {
        return;
      }
      if (playSpeed && this.props.currentSegment) {
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
            if (this.props.startTime < Date.now()) {
              videoPlayer.playbackRate = (this.props.playSpeed + timeDiff);
            } else {
              videoPlayer.playbackRate = 0;
            }
            noVideo = false;
          }
        } else {
          noVideo = false;
          videoPlayer.playbackRate = playSpeed;
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
    var calibration = TimelineWorker.getCalibration(this.props.route);

    if (!calibration) {
      this.lastCalibrationTime = false;
      return;
    }
    if (calibration) {
      if (this.lastCalibrationTime !== calibration.LogMonoTime) {
        this.extrinsic = [...calibration.LiveCalibration.ExtrinsicMatrix, 0, 0, 0, 1];
      }
      this.lastCalibrationTime = calibration.LogMonoTime;
    }
    if (this.canvas_lines.current) {
      this.renderEventToCanvas(this.canvas_lines.current, calibration, TimelineWorker.currentModel, this.renderLaneLines);
    }
    if (this.canvas_lead.current) {
      this.renderEventToCanvas(this.canvas_lead.current, calibration, TimelineWorker.currentLive20, this.renderLeadCars);
    }
    if (this.canvas_mpc.current) {
      this.renderEventToCanvas(this.canvas_mpc.current, calibration, TimelineWorker.currentMPC, this.renderMPC);
    }
    if (this.canvas_carstate.current) {
      this.renderEventToCanvas(this.canvas_carstate.current, calibration, TimelineWorker.currentCarState, this.renderCarState);
    }
  }
  renderEventToCanvas (canvas, calibration, getEvent, renderEvent) {
    var { width, height } = canvas.getBoundingClientRect();

    if (!calibration) {
      let ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      return; // loading calibration from logs still...
    }

    let event = getEvent.apply(TimelineWorker);
    let logTime = event ? event.LogMonoTime : null;
    let monoIndex = getEvent.name + 'MonoTime';
    if (!event) {
      if (this[monoIndex]) {
        this[monoIndex] = false;
        let ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
      }
      return;
    }
    if (logTime === this[monoIndex]) {
      return;
    }
    this[monoIndex] = logTime;
    // will render!
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    // reset transform before anything, just in case
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // clear all the data
    ctx.clearRect(0, 0, width, height);
    // scale original coords onto our current size
    ctx.scale(width / 1164, height / 874);

    renderEvent.apply(this, [{ width, height, ctx }, event]);
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
      this.renderLeadCar(options, leadTwo, true);
    }
  }
  renderLeadCar (options, leadData, is2ndCar) {
    var { width, height, ctx } = options;

    var drel = leadData.DRel;
    var vrel = leadData.VRel;
    var yrel = leadData.YRel;

    var x = drel + 2.7;
    var y = yrel;

    var [x, y, z] = this.carSpaceToImageSpace([drel + 2.7, yrel, 0, 1]);

    if (x < 0 || y < 0) {
      return
    }

    var sz = 25 * 30;
    sz /= ((drel + 2.7) / 3 + 30);
    sz = Math.min(Math.max(sz, 15), 30);
    if (is2ndCar) {
      sz /= 1.2;
    }

    var fillAlpha = 0;
    var speedBuff = 10;
    var leadBuff = 40;

    if (drel < leadBuff) {
      fillAlpha = 255 * (1 - (drel / leadBuff));
      if (vrel < 0) {
        fillAlpha += 255 * (-1 * (vrel / speedBuff));
      }
      fillAlpha = Math.min(fillAlpha, 255) / 255;
    }

    // glow
    if (is2ndCar) {
      ctx.strokeStyle = 'rgba(218, 202, 37, 0.5)';
    } else {
      ctx.strokeStyle = 'rgb(218, 202, 37)';
    }
    ctx.lineWidth = 5;
    var g_xo = sz / 5;
    var g_yo = sz / 10;
    ctx.beginPath();
    ctx.moveTo(x + (sz * 1.35) + g_xo, y + sz + g_yo);
    ctx.lineTo(x, y - g_xo);
    ctx.lineTo(x - (sz * 1.35) - g_xo, y + sz + g_yo);
    ctx.lineTo(x + (sz * 1.35) + g_xo, y + sz + g_yo);
    ctx.stroke();

    if (fillAlpha > 0) {
      if (is2ndCar) {
        fillAlpha /= 1.5;
      }
      ctx.fillStyle = 'rgba(201, 34, 49, ' + fillAlpha + ')';

      ctx.beginPath();
      ctx.moveTo(x + (sz * 1.25), y + sz);
      ctx.lineTo(x, y);
      ctx.lineTo(x - (sz * 1.25), y + sz);
      ctx.lineTo(x + (sz * 1.25), y + sz);
      ctx.stroke();
    }
  }
  renderLaneLines (options, model) {
    this.lastModelMonoTime = model.LogMonoTime;
    var { width, height, ctx } = options;

    ctx.lineWidth = 5;
    ctx.strokeStyle = 'blue';
    let prob = ~~((model.Model.LeftLane.Prob) * 255);
    ctx.strokeStyle = 'rgba(' + prob + ', ' + prob + ', 255, 1)';
    this.drawLine(ctx, model.Model.LeftLane.Points, 0.025 * model.Model.LeftLane.Prob);
    prob = (model.Model.RightLane.Prob) * 255;
    ctx.strokeStyle = 'rgba(' + prob + ', ' + prob + ', 255, 1)';
    this.drawLine(ctx, model.Model.RightLane.Points, 0.025 * model.Model.RightLane.Prob);

    // colors for ghost/accuracy lines
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.max(0.1, 0.7 - model.Model.LeftLane.Prob) + ')';
    ctx.lineWidth = 8;
    this.drawLine(ctx, model.Model.LeftLane.Points, model.Model.LeftLane.Std);
    this.drawLine(ctx, model.Model.LeftLane.Points, 0 - model.Model.LeftLane.Std);

    ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.max(0.1, 0.7 - model.Model.RightLane.Prob) + ')';
    this.drawLine(ctx, model.Model.RightLane.Points, model.Model.RightLane.Std);
    this.drawLine(ctx, model.Model.RightLane.Points, 0 - model.Model.RightLane.Std);

    ctx.strokeStyle = 'purple';
    ctx.lineWidth = 5 * 1 / model.Model.Path.Prob;
    this.drawLine(ctx, model.Model.Path.Points, 0);
  }
  drawLine (ctx, points, std) {
    std = Math.min(std, 0.7);
    std = Math.max(std, -0.7);

    ctx.beginPath();
    var isFirst = true;
    var isAbove = false;
    var isBelow = false;
    var isLeft = false;
    var isRight = false;
    points.forEach((val, i) => {
      var [x, y, z] = this.carSpaceToImageSpace([i, val - std, 0, 1]);

      // there are no lines that draw to the top of the screen
      // so we just filter all of those out right away
      if (y < 0) {
        return;
      }
      if ((isRight && isLeft) || (isAbove && isBelow)) {
        return;
      }
      if (x < 0) {
        isLeft = true;
        if (isRight) {
          return;
        }
      }
      if (x > 1164) {
        isRight = true;
        if (isLeft) {
          return;
        }
      }
      if (y > 874) {
        isBelow = true;
        if (isAbove) {
          return;
        }
      }
      if (y < 0) {
        isAbove = true;
        if (isBelow) {
          return;
        }
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
  renderMPC (options, mpc) {
    var { width, height, ctx } = options;
    var data = mpc.LiveMpc;
    var isFirst = true;

    var alpha = Math.max(0, 1 - (data.Cost / 50));

    ctx.strokeStyle = 'rgb(' + ~~((1 - alpha) * 255) + ', ' + ~~(alpha * 255) + ', 0)';
    ctx.fillStyle = 'rgb(' + ~~((1 - alpha) * 255) + ', ' + ~~(alpha * 255) + ', 0)';
    ctx.beginPath();
    data.X.forEach((x, i) => {
      let y = data.Y[i];
      let z = 0;
      [x, y, z] = this.carSpaceToImageSpace([x, y, 0, 1]);

      ctx.lineWidth = -50 / z;

      if (y < 0) {
        return;
      }

      let psi = data.Psi[i];

      if (isFirst) {
        isFirst = false;
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0 - psi);
      ctx.translate(-x, -y);
      ctx.fillRect(x - 500 / z, y - 16 / z, 1000 / z, 32 / z);
      ctx.restore();
    });
    ctx.stroke();
  }
  renderCarState (options, carState) {
    var { width, height, ctx } = options;
    var data = carState.CarState;

    var pWidth = 1164;
    var pHeight = 874;
    var radius = 60;
    var border = 20;
    var x = radius + border;
    var y = x;

    ctx.fillStyle = 'black';
    ctx.strokeStyle = 'black';
    ctx.translate(x, y);
    ctx.rotate(0 - data.SteeringAngle * Math.PI / 180);

    ctx.save();
    ctx.translate(-x, -y);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2';
    ctx.lineWidth = 9;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.stroke();

    // ctx.beginPath();
    // ctx.arc(x, y, radius / 3, 0, 2 * Math.PI, false);
    // ctx.fill();

    ctx.restore();
    ctx.save();
    ctx.rotate(0.3);
    ctx.translate(-x, -y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2';
    ctx.fillRect(x - radius, y - 3, radius * 2, 7);
    ctx.fillStyle = 'black';
    ctx.fillRect(x - radius, y - 2, radius * 2, 5);

    ctx.restore();
    ctx.save();
    ctx.rotate(-0.3);
    ctx.translate(-x, -y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2';
    ctx.fillRect(x - radius, y - 3, radius * 2, 7);
    ctx.fillStyle = 'black';
    ctx.fillRect(x - radius, y - 2, radius * 2, 5);
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
            playbackRate={ this.props.startTime > Date.now() ? 0 : this.props.playSpeed }
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
          <canvas ref={ this.canvas_mpc } className={ this.props.classes.canvas } style={{
            zIndex: 2
          }} />
          <canvas ref={ this.canvas_lines } className={ this.props.classes.canvas } style={{
            zIndex: 2
          }} />
          <canvas ref={ this.canvas_lead } className={ this.props.classes.canvas } style={{
            zIndex: 2
          }} />
          <canvas ref={ this.canvas_carstate } className={ this.props.classes.canvas } style={{
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
