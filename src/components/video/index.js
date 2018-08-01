import React, { Component } from 'react';
import { connect } from 'react-redux'
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import { classNames } from 'react-extras';
import theme from '../../theme';

import { Player, ControlBar, PlaybackRateMenuButton } from 'video-react';
import Measure from 'react-measure';
import 'video-react/dist/video-react.css'; // CSS for video

import HLSSource from './hlsSource';
import TimelineWorker from '../../timeline';

// UI Assets
var wheelImg = new Image();
wheelImg.src = require('../../icons/icon-chffr-wheel.svg');

// UI Measurements
const vwp_w = 1164;
const vwp_h = 874;
const bdr_s = 30;

const styles = theme => {
  return {
    root: {},
    hidden: {
      display: 'none'
    },
    videoContainer: {
      position: 'relative',
    },
    videoImage: {
      height: 'auto',
      position: 'absolute',
      top: 0,
      width: '100%',
      zIndex: 1
    },
    videoUiCanvas: {
      height: '100%',
      left: 0,
      position: 'absolute',
      top: 0,
      width: '100%',
    },
  }
};

class VideoPreview extends Component {
  constructor (props) {
    super(props);

    this.updatePreview = this.updatePreview.bind(this);
    this.imageRef = React.createRef();
    this.videoPlayer = React.createRef();
    this.canvas_road = React.createRef();
    this.canvas_lead = React.createRef();
    this.canvas_carstate = React.createRef();

    this.intrinsic = intrinsicMatrix();

    this.state = {
      bufferTime: 4,
      src: this.videoURL(),
      noVideo: false,
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
              // console.log('Seeking!', desiredVideoTime);
              // debugger;
              if (isBuffered) {
                videoPlayer.seek(desiredVideoTime);
              } else {
                // console.log(playerState, desiredVideoTime);
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
    if (!this.props.shouldShowUI) {
      return
    }

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
    if (this.canvas_road.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        model: TimelineWorker.currentModel,
        mpc: TimelineWorker.currentMPC,
        carState: TimelineWorker.currentCarState,
      };
      this.renderEventToCanvas(
        this.canvas_road.current, params, events, this.drawLaneFull);
    }
    if (this.canvas_lead.current) {
      const params = { calibration, shouldScale: true };
      const events = { live20: TimelineWorker.currentLive20 };
      this.renderEventToCanvas(
        this.canvas_lead.current, params, events, this.renderLeadCars);
    }
    if (this.canvas_carstate.current) {
      const params = { calibration, shouldScale: true };
      const events = { carState: TimelineWorker.currentCarState };
      this.renderEventToCanvas(
        this.canvas_carstate.current, params, events, this.renderCarState);
    }
  }
  renderEventToCanvas (canvas, params, events, renderEvent) {
    var { width, height } = canvas.getBoundingClientRect();

    if (!params.calibration) {
      let ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      return; // loading calibration from logs still...
    }

    let logTime, monoIndex;
    let _events = {};
    let needsRender = false;
    let eventsSig = Object.keys(events).join(',');
    Object.keys(events).map((key) => {
      let event = events[key].apply(TimelineWorker);
      monoIndex = events[key].name + 'MonoTime' + eventsSig;

      if (!event) {
        if (this[monoIndex]) {
          this[monoIndex] = false;
          let ctx = canvas.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, width, height);
          // we have to force re-render when one is missing
          // this is because there's more than one event being rendered through this flow
          // this should be re-broken apart such that this isn't an issue
          // fixing that will also reduce the rendering complexity
          needsRender = true;
        }
        return;
      } else {
        logTime = event ? event.LogMonoTime : null;
        needsRender = needsRender || logTime !== this[monoIndex];
        this[monoIndex] = logTime;
        _events[key] = event;
      }
    })

    if (!needsRender) {
      return;
    }
    // will render!
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    // reset transform before anything, just in case
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // clear all the data
    ctx.clearRect(0, 0, width, height);
    // scale original coords onto our current size
    if (params.shouldScale) {
      ctx.scale(width / vwp_w, height / vwp_h);
    }

    renderEvent.apply(this, [{ width, height, ctx }, _events]);
  }
  renderLeadCars (options, events) {
    if (!events.live20) {
      return;
    }
    this.lastLive20MonoTime = events.live20.LogMonoTime;
    var { width, height, ctx } = options;

    var leadOne = events.live20.Live20.LeadOne;
    var leadTwo = events.live20.Live20.LeadTwo;

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
      ctx.fillStyle = 'rgba(218, 202, 37, 0.5)';
    } else {
      ctx.fillStyle = 'rgb(218, 202, 37)';
    }
    ctx.lineWidth = 5;
    var g_xo = sz / 5;
    var g_yo = sz / 10;
    ctx.beginPath();
    ctx.moveTo(x + (sz * 1.35) + g_xo, y + sz + g_yo);
    ctx.lineTo(x, y - g_xo);
    ctx.lineTo(x - (sz * 1.35) - g_xo, y + sz + g_yo);
    ctx.lineTo(x + (sz * 1.35) + g_xo, y + sz + g_yo);
    ctx.fill();

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
      ctx.fill();
    }
  }
  drawLaneFull(options, events) { // ui_draw_vision_lanes
    var { ctx } = options;
    if (events) {
      if (events.model) {
        this.drawLaneBoundary(ctx, events.model.Model.LeftLane);
        this.drawLaneBoundary(ctx, events.model.Model.RightLane);
        this.drawLaneTrack(ctx, events.model.Model.Path);
      }
      if (events.mpc && events.carState) {
        this.drawLaneTrack(ctx, events.mpc.LiveMpc, {
          isMpc: true,
          isEnabled: events.carState.CarState.CruiseState.Enabled,
        });
      }
    }
  }
  drawLaneBoundary(ctx, lane) { // ui_draw_lane
    let color = 'rgba(255, 255, 255,' + lane.Prob + ')';
    this.drawLaneLine(ctx, lane.Points, 0.035 * lane.Prob, color, false);
    let offset = Math.min(lane.Std, 0.7);
    color = 'rgba(255, 255, 255,' + lane.Prob + ')';
    this.drawLaneLine(ctx, lane.Points, -offset, color, true);
    this.drawLaneLine(ctx, lane.Points, offset, color, true);
  }
  drawLaneLine(ctx, points, off, color, isGhost) { // ui_draw_lane_line
    ctx.beginPath();
    let started = false;
    const line_height = 49;
    for (let i=0; i < line_height; i++) {
      let px = i;
      let py = points[i]-off;
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (y < 0) {
        continue;
      }
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    for (let i=line_height; i > 0; i--) {
      let px = i==line_height?line_height:i;
      let py = isGhost?(points[i]-off):(points[i]+off);
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (y < 0) {
        continue;
      }
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (!isGhost) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.1;
      ctx.stroke();
    }
  }
  drawLaneTrack(ctx, path, params) {
    let isMpc, isEnabled;
    if (params) {
      isMpc = params.isMpc;
      isEnabled = params.isEnabled;
    }
    ctx.beginPath();
    let started = false;
    let offset = isMpc?0.3:0.5;
    let path_height = isMpc?20:49;
    for (let i=0; i <= path_height; i++) {
      let px, py, mpx;
      if (isMpc) {
        px = i==0?0.0:path.X[i];
        py = path.Y[i]-offset;
      } else {
        px = i;
        py = path.Points[i] - offset;
      }
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (y < 0) {
        continue;
      }

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    for (let i=path_height; i >= 0; i--) {
      let px, py, mpx;
      if (isMpc) {
        px = i==0?0.0:path.X[i];
        py = path.Y[i] + offset;
      } else {
        px = i;
        py = path.Points[i] + offset;
      }
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (y < 0) {
        continue;
      }
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    let track_bg;
    if (isMpc) {
      track_bg = ctx.createLinearGradient(vwp_w, vwp_h-40, vwp_w, vwp_h * 0.4);
      if (isEnabled) {
        track_bg.addColorStop(0, 'rgba(23, 134, 68, 0.8)');
        track_bg.addColorStop(1, 'rgba(14, 89, 45, 0.8)');
      } else {
        track_bg.addColorStop(0, 'rgba(23, 88, 134, 0.6)');
        track_bg.addColorStop(1, 'rgba(15, 58, 89, 0.6)');
      }
    } else {
      track_bg = ctx.createLinearGradient(vwp_w, vwp_h, vwp_w, vwp_h * 0.5);
      track_bg.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      track_bg.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    }
    ctx.fillStyle = track_bg;
    ctx.fill();
  }
  renderCarState (options, events) {
    var { ctx } = options;
    if (events && events.carState) {
      this.drawCarStateBorder(options, events.carState.CarState);
      this.drawCarStateWheel(options, events.carState.CarState);
    }
  }
  drawCarStateWheel(options, CarState) {
    var { ctx } = options;

    var radius = 80;
    var x = vwp_w - (radius + (bdr_s * 2));
    var y = radius + (bdr_s * 2);

    // Wheel Background
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    if (CarState.CruiseState.Enabled) {
      ctx.fillStyle = theme.palette.states.engagedGreen;
    } else if (CarState.CruiseState.Available) {
      ctx.fillStyle = theme.palette.states.drivingBlue;
    } else {
      ctx.fillStyle = theme.palette.states.drivingBlue;
    }
    ctx.closePath();
    ctx.fill();

    // Rotate Wheel
    ctx.translate(x, y);
    ctx.rotate(0 - CarState.SteeringAngle * Math.PI / 180);
    ctx.save();
    ctx.translate(-x, -y);

    // Wheel Image
    ctx.beginPath();
    ctx.arc(x, y, radius-(bdr_s/2), 0, 2 * Math.PI, false);
    var wheelImgPattern = ctx.createPattern(wheelImg, 'repeat')
    ctx.fillStyle = wheelImgPattern;
    ctx.closePath();
    ctx.translate(vwp_w-((bdr_s*2)+bdr_s/2), (bdr_s*2)+bdr_s/2);
    ctx.fill();
  }
  drawCarStateBorder(options, carState) {
    var { ctx } = options;
    ctx.lineWidth = bdr_s*2;

    if (carState.CruiseState.Enabled) {
      ctx.strokeStyle = theme.palette.states.engagedGreen;
    } else if (carState.CruiseState.Available) {
      ctx.strokeStyle = theme.palette.states.drivingBlue;
    } else {
      ctx.strokeStyle = theme.palette.states.drivingBlue;
    }
    ctx.strokeRect(0, 0, vwp_w, vwp_h);
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
    const { classes } = this.props;
    return (
      <div
        className={ classNames(classes.videoContainer, {
          [classes.hidden]: false // this.state.noVideo
        }) }>
        <Player
          ref={ this.videoPlayer }
          style={{ zIndex: 1 }}
          autoPlay={ !!this.props.currentSegment }
          muted={ true }
          fluid={ true }
          src={ this.state.src }
          startTime={ this.currentVideoTime() }
          playbackRate={ this.props.startTime > Date.now() ? 0 : this.props.playSpeed }>
          <HLSSource
            isVideoChild />
          <ControlBar disabled />
        </Player>
        <img
          ref={ this.imageRef }
          className={ classes.videoImage }
          src={this.nearestImageFrame()} />
        { this.props.shouldShowUI &&
          <React.Fragment>
            <canvas
              ref={ this.canvas_road }
              className={ classes.videoUiCanvas }
              style={{ zIndex: 2 }} />
            <canvas
              ref={ this.canvas_lead }
              className={ classes.videoUiCanvas }
              style={{ zIndex: 4 }} />
            <canvas
              ref={ this.canvas_carstate }
              className={ classes.videoUiCanvas }
              style={{ zIndex: 5 }} />
          </React.Fragment>
        }
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
