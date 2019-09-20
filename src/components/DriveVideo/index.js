import React, { Component } from 'react';
import { connect } from 'react-redux'
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import { classNames } from 'react-extras';
import { multiply } from 'mathjs';
import debounce from 'debounce';

import { Player, ControlBar, PlaybackRateMenuButton } from 'video-react';
import Measure from 'react-measure';
import 'video-react/dist/video-react.css'; // CSS for video

import theme from '../../theme';
import HLSSource from './hlsSource';
import TimelineWorker from '../../timeline';
import { strokeRoundedRect, fillRoundedRect } from './canvas';
import Buffering from './buffering';

// UI Assets
var wheelImg = new Image();
wheelImg.src = require('../../icons/icon-chffr-wheel.svg');

// UI Measurements
const vwp_w = 1164;
const vwp_h = 874;
const bdr_s = 30;

// driver monitoring constants
const _PITCH_NATURAL_OFFSET = 0.12;
const _YAW_NATURAL_OFFSET = 0.08;
const _PITCH_POS_ALLOWANCE = 0.04;
const _PITCH_WEIGHT = 1.35;
const _METRIC_THRESHOLD = 0.4;
const W = 160;
const H = 320;
const RESIZED_FOCAL = 320.0;
const FULL_W = 426;
const DM_FACE_THRESHOLD = 0.4; // probs below this disappear
const DM_BLINK_THRESHOLD = 0.2; // probs above this count as blinking

const STREAM_VERSION = 2;

const styles = theme => {
  return {
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
    this.onSourceLoaded = this.onSourceLoaded.bind(this);
    this.onDisableBuffering = this.onDisableBuffering.bind(this);

    // this.checkVideoBuffer = this.checkVideoBuffer.bind(this);

    this.imageRef = React.createRef();
    this.videoPlayer = React.createRef();
    this.canvas_road = React.createRef();
    this.canvas_lead = React.createRef();
    this.canvas_carstate = React.createRef();
    this.canvas_maxspeed = React.createRef();
    this.canvas_speed = React.createRef();
    this.canvas_face = React.createRef();

    this.intrinsic = intrinsicMatrix();
    this.frame = 0;

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
    this.rafLoop = raf(this.updatePreview);
    this.checkVideoBuffer();
    this.stopListening = TimelineWorker.onIndexed(() => this.checkDataBuffer());
  }

  componentWillUnmount () {
    this.mounted = false;
    if (this.rafLoop) {
      raf.cancel(this.rafLoop);
      this.rafLoop = null;
    }
    if (this.stopListening) {
      this.stopListening();
      this.stopListening = null;
    }
    if (this.stopListeningToVideo) {
      this.stopListeningToVideo();
      this.stopListeningToVideo = null;
    }
  }

  componentDidUpdate (prevProps, prevState) {
    let newUrl = this.videoURL();
    if (this.state.src !== newUrl && newUrl.length) {
      this.setState({
        src: newUrl
      });
    }
    // play state
    this.checkVideoBuffer();
  }

  onSourceLoaded () {
    if (this.videoPlayer.current) {
      console.log('Calling load with media change');
      this.videoPlayer.current.load();
    }
  }

  onDisableBuffering () {
    TimelineWorker.disableBuffer();
  }

  updatePreview () {
    // schedule next run right away so that we can return early
    this.rafLoop = raf(this.updatePreview);

    this.frame++;
    if (this.frame >= 60) {
      this.frame = 0;
      this.checkVideoBuffer();
    }

    // 10 fps
    if (this.frame % 6 === 0) {
      this.checkDataBuffer();
    }
    if (this.frame % 6 === 3) {
      this.renderCanvas();
    }
  }

  checkDataBuffer = debounce(() => {
    let monoTime = TimelineWorker.currentLogMonoTime();
    let [lastEvent] = TimelineWorker.lastEvents(1);

    let isDataBuffering = !lastEvent;
    if (lastEvent) {
      let monoTimeLength = ('' + monoTime).length;
      let monSec = lastEvent.LogMonoTime.substr(0, monoTimeLength);
      let timeDiff = Math.abs(monoTime - Number(monSec));
      if (timeDiff > 2000) {
        // 2 seconds of grace
        // console.log('Buffering data', timeDiff);
        isDataBuffering = true;
      }
    }
    if (!this.props.currentSegment) {
      isDataBuffering = false;

      if (this.props.bufferVideo) {
        console.log('Exited segment while buffering, exiting buffer state');
        TimelineWorker.bufferVideo(false);
      }
    }

    if (isDataBuffering !== this.props.bufferingData) {
      console.log('Changing data buffer state to', isDataBuffering);
      TimelineWorker.bufferData(isDataBuffering);
    }

  }, 100)

  checkVideoBuffer = debounce(() => {
    let videoPlayer = this.videoPlayer.current;

    if (videoPlayer && !videoPlayer.wasConnected) {
      videoPlayer.wasConnected = true;
      if (this.stopListeningToVideo) {
        this.stopListeningToVideo();
        this.stopListeningToVideo = null;
      }
      this.stopListeningToVideo = videoPlayer.subscribeToStateChange(this.checkVideoBuffer);
    }

    let offset = TimelineWorker.currentOffset();
    let shouldShowPreview = true;
    let bufferTime = this.state.bufferTime;
    let noVideo = this.state.noVideo;
    let playSpeed = this.props.playSpeed;
    let desiredPlaySpeed = this.props.desiredPlaySpeed;

    if (videoPlayer) {
      let playerState = videoPlayer.getState().player;
      if (!playerState.buffered || Number.isNaN(playerState.duration)) {
        return;
      }
      if (desiredPlaySpeed && this.props.currentSegment) {
        let curVideoTime = playerState.currentTime;
        let desiredVideoTime = this.currentVideoTime(offset);
        let timeDiff = desiredVideoTime - curVideoTime;

        let desiredBufferedVideoTime = desiredVideoTime;
        if (this.props.bufferingVideo) {
          // if we're currently already paused buffering for video
          // then wait for another few seconds of video t oload
          desiredBufferedVideoTime += 3 * desiredPlaySpeed;
        }
        // clip the duration down slightly to handle rounding errors near the end of video
        desiredVideoTime = Math.min(playerState.duration - 0.4, desiredVideoTime);
        desiredBufferedVideoTime = Math.min(playerState.duration - 0.4, desiredBufferedVideoTime);

        let isBuffering = true;
        let remainingTime = desiredBufferedVideoTime;

        for (let i = 0, buf = playerState.buffered, len = buf.length; i < len; ++i) {
          let start = buf.start(i);
          // if we seek to a spot **right** at the start of an already loaded segment then
          // HLS doesn't actually load that segment. it just expects to jump forwards a bit and be fine
          // because of this, the first 4 seconds of a given video is almost never available
          // additionally, sometimes even in the middle of the video it can be off and not load due to rounding errors
          // we check if we're in the first 5 seconds or if we're *right* before the start
          // "stuck seeking" errors are handled below
          if (start < 5 && desiredVideoTime < 5 || (start > desiredVideoTime && start - desiredVideoTime < 0.5)) {
            start = desiredVideoTime;
          }
          if (start <= desiredVideoTime) {
            if (buf.end(i) >= desiredBufferedVideoTime) {
              isBuffering = false;
            } else {
              remainingTime = Math.min(remainingTime, desiredBufferedVideoTime - buf.end(i));
            }
          }
        }

        if (isBuffering) {
          // console.log('We need', remainingTime, 'more time buffered...');
        }

        if (playerState.waiting || playerState.seeking) {
          isBuffering = true;
        }

        let timeDiffAbs = Math.abs(timeDiff);
        if (Number.isFinite(timeDiff) && timeDiffAbs > 0) {
          if (this.props.isBuffering && playerState.paused && !playerState.seeking && timeDiffAbs > 1.0) {
            // console.log('SEEK paused', timeDiff);
            videoPlayer.seek(desiredVideoTime);
            isBuffering = true;
          } else if (timeDiffAbs > 1.0) {
            // console.log('Seeking video', timeDiff, desiredVideoTime, curVideoTime);
            videoPlayer.seek(desiredVideoTime);
            if (desiredVideoTime > 5) {
              isBuffering = true;
            }
          } else if (timeDiffAbs > 0.2) {
            desiredPlaySpeed = desiredPlaySpeed + timeDiff;
          // } else {
          }
        }

        if (this.props.bufferingVideo !== isBuffering) {
          // console.log('Changing video buffer state to', isBuffering);
          TimelineWorker.bufferVideo(isBuffering);
        }

        shouldShowPreview = isBuffering;
        noVideo = isBuffering;

        desiredPlaySpeed = Math.round(desiredPlaySpeed * 5) / 5;

        if (videoPlayer.playbackRate !== desiredPlaySpeed) {
          videoPlayer.playbackRate = desiredPlaySpeed;
        }

        if (!isBuffering && !this.props.bufferingData && this.props.currentSegment && playerState.paused) {
          console.log('Play');
          videoPlayer.play();
        }
        if (!isBuffering && this.props.isBuffering && !playerState.paused) {
          console.log('Pause for buffering...');
          videoPlayer.pause();
        }
      } else {
        // desired player speed is 0 or there's no segment
        // either way, no video to load
        if (this.props.bufferingVideo) {
          TimelineWorker.bufferVideo(false);
        }
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
      // not used anymore, also could be derrived from the buffer state in props
      // this.setState({
      //   noVideo
      // });
    }
  }, 100)

  renderCanvas () {
    var calibration = TimelineWorker.getCalibration(this.props.route);
    if (!calibration) {
      this.lastCalibrationTime = false;
      return;
    }

    if (this.props.front) {
      if (this.canvas_face.current) {
        const params = { calibration, shouldScale: true };
        const events = {
          driverMonitoring: TimelineWorker.currentDriverMonitoring
        };
        this.renderEventToCanvas(
          this.canvas_face.current, params, events, this.renderDriverMonitoring);
      }
    }

    if (!this.props.shouldShowUI) {
      return
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
    if (this.canvas_maxspeed.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        live100: TimelineWorker.currentLive100,
        liveMapData: TimelineWorker.currentLiveMapData,
        initData: TimelineWorker.currentInitData,
      };
      this.renderEventToCanvas(
        this.canvas_maxspeed.current, params, events, this.renderMaxSpeed);
    }
    if (this.canvas_speed.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        live100: TimelineWorker.currentLive100,
        initData: TimelineWorker.currentInitData,
      };
      this.renderEventToCanvas(
        this.canvas_speed.current, params, events, this.renderSpeed);
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
  drawLaneFull (options, events) { // ui_draw_vision_lanes
    var { ctx } = options;
    if (events) {
      if (events.model) {
        this.drawLaneBoundary(ctx, events.model.Model.LeftLane);
        this.drawLaneBoundary(ctx, events.model.Model.RightLane);
        this.drawLaneTrack(options, events.model.Model.Path);
      }
      if (events.mpc && events.carState) {
        this.drawLaneTrack(options, events.mpc.LiveMpc, {
          isMpc: true,
          isEnabled: events.carState.CarState.CruiseState.Enabled,
        });
      }
    }
  }
  drawLaneBoundary (ctx, lane) { // ui_draw_lane
    let color = 'rgba(255, 255, 255,' + lane.Prob + ')';

    let points;
    if (lane.Points.length > 0) {
      points = lane.Points;
    } else {
      points = [];
      for (let i = 0; i < 192; i++) {
        points.push(lane.Poly[0] * (i*i*i) + lane.Poly[1] * (i*i) + lane.Poly[2] * i + lane.Poly[3]);
      }
    }
    this.drawLaneLine(ctx, points, 0.035 * lane.Prob, color, false);
    let offset = Math.min(lane.Std, 0.7);
    color = 'rgba(255, 255, 255,' + lane.Prob + ')';
    this.drawLaneLine(ctx, points, -offset, color, true);
    this.drawLaneLine(ctx, points, offset, color, true);
  }
  drawLaneLine (ctx, points, off, color, isGhost) { // ui_draw_lane_line
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
  drawLaneTrack (options, path, params) {
    const { ctx } = options;
    let isMpc, isEnabled;
    if (params) {
      isMpc = params.isMpc;
      isEnabled = params.isEnabled;
    }
    ctx.beginPath();
    let started = false;
    let offset = isMpc?0.3:0.5;
    let path_height = isMpc?20:49;
    let points;
    if (path.Points.length > 0) {
      points = path.Points;
    } else {
      points = [];
      for (let i = 0; i < 192; i++) {
        points.push(path.Poly[0] * (i*i*i) + path.Poly[1] * (i*i) + path.Poly[2] * i + path.Poly[3]);
      }
    }
    for (let i=0; i <= path_height; i++) {
      let px, py;
      if (isMpc) {
        px = path.X[i];
        py = path.Y[i]-offset;
      } else {
        px = i;
        py = points[i] - offset;
      }
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (i === 0) {
        y = vwp_h;
      } else if (y < 0) {
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
      let px, py;
      if (isMpc) {
        px = path.X[i];
        py = path.Y[i] + offset;
      } else {
        px = i;
        py = points[i] + offset;
      }
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (i === 0) {
        y = vwp_h;
      } else if (y < 0) {
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
    if (events && events.carState) {
      this.drawCarStateBorder(options, events.carState.CarState);
      this.drawCarStateWheel(options, events.carState.CarState);
    }
  }

  renderSpeed (options, events) {
    if (events && events.live100 && events.initData) {
      this.drawSpeed(options, events.live100.Live100, events.initData.InitData);
    }
  }
  drawSpeed (options, Live100, InitData) {
    var { ctx } = options;

    var speed = Live100.VEgo;

    var metricParam = InitData.Params.Entries.find((entry) => entry.Key === "IsMetric");
    var isMetric = metricParam.Value === "1";
    if (isMetric) {
      speed = Math.floor(speed * 3.6 + 0.5);
    } else {
      speed = Math.floor(speed * 2.2369363 + 0.5);
    }

    var x = vwp_w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 128px Open Sans';
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillText(speed, x, 140);

    ctx.font = '400 48px Open Sans';
    ctx.fillStyle = 'rgba(255,255,255,200)';
    if (isMetric) {
      ctx.fillText("kph", x, 210);
    } else {
      ctx.fillText("mph", x, 210);
    }

  }
  renderMaxSpeed (options, events) {
    if (events && events.live100 && events.initData) {
      var liveMapData = (events.liveMapData && events.liveMapData.LiveMapData) || undefined;
      this.drawMaxSpeed(options, events.live100.Live100, liveMapData, events.initData.InitData);
    }
  }

  drawMaxSpeed (options, Live100, LiveMapData, InitData) {
    var { ctx } = options;

    var maxSpeed = Live100.VCruise;
    var maxSpeedCalc = maxSpeed * 0.6225 + 0.5;
    var isSpeedLimitValid = LiveMapData !== undefined && LiveMapData.SpeedLimitValid;
    var speedLimit = (LiveMapData && LiveMapData.SpeedLimit) || 0;
    var speedLimitCalc = speedLimit * 2.2369363 + 0.5;

    var speedLimitOffset = 0;
    var speedLimitOffsetParam = InitData.Params.Entries.find((entry) => entry.Key === "SpeedLimitOffset");
    if (speedLimitOffsetParam) {
      speedLimitOffset = parseFloat(speedLimitOffsetParam.Value);
    }

    var metricParam = InitData.Params.Entries.find((entry) => entry.Key === "IsMetric");
    if (metricParam.Value === "1") {
      maxSpeedCalc = maxSpeed + 0.5;
      speedLimitCalc = speedLimit * 3.6 + 0.5;
      speedLimitOffset = speedLimitOffset * 3.6 + 0.5;
    }

    var isCruiseSet = !isNaN(Live100.VCruise) && Live100.VCruise != 0 && Live100.VCruise != 255;

    var isSetOverLimit = (
      isSpeedLimitValid
      && Live100.Enabled
      && isCruiseSet
      && maxSpeedCalc > (speedLimitCalc + speedLimitOffset)
    );
    var hysteresisOffset = 0.5; // TODO adjust to 0.0 if last isEgoOverLimit==true
    var isEgoOverLimit = isSpeedLimitValid && Live100.VEgo > (speedLimit + speedLimitOffset + hysteresisOffset);
    var speedLimWidth = Math.floor(180 * (2/3));
    var width = Math.floor(184 * (2/3)) + speedLimWidth;
    var height = Math.floor(202 * (2/3));

    var left = bdr_s*2 + (width - speedLimWidth*2);
    var top = bdr_s*2;

    // background
    var fillStyle;
    if (isSetOverLimit) {
      fillStyle = 'rgba(218, 111, 37, 0.705)';
    } else {
      fillStyle = 'rgba(0, 0, 0, 0.392)';
    }
    fillRoundedRect(ctx, left, top, width, height, 30, fillStyle);

    // border
    var strokeStyle;
    if (isSetOverLimit) {
      strokeStyle="rgba(218, 111, 37, 1.0)";
    } else if (isSpeedLimitValid && !isEgoOverLimit) {
      strokeStyle="rgba(255, 255, 255, 1.0)";
    } else if (isSpeedLimitValid && isEgoOverLimit) {
      strokeStyle="rgba(255, 255, 255, 0.078)";
    } else {
      strokeStyle="rgba(255, 255, 255, 0.392)";
    }
    strokeRoundedRect(ctx, left, top, width, height, 20, 10, strokeStyle);

    var textTopY = top + (26*4/3);
    var textBottomY = textTopY + (48*(4/3));
    // MAX text
    ctx.font = 26*(4/3) + "px Open Sans";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isCruiseSet) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.784)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.392)';
    }

    ctx.fillText("MAX", left+speedLimWidth/2+width/2, textTopY);

    // max speed text
    if (isCruiseSet) {
      ctx.font = "700 " + 48*(4/3) + "px Open Sans";
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.fillText(Math.floor(maxSpeedCalc), 2 + left + speedLimWidth/2 + width / 2, textBottomY);
    } else {
      ctx.font = "600 " + 42*(4/3) + "px Open Sans";
      ctx.fillStyle = 'rgba(255, 255, 255, 0.392)';
      ctx.fillText("N/A", left + speedLimWidth/2 + width / 2, textBottomY);
    }

    if (Live100.DecelForTurn && Live100.Enabled) {
      var turnSpeed = Live100.VCurvature * 2.2369363 + 0.5;
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.font = "700 " + 25*(4/3) + "px Open Sans";
      ctx.fillText("TURN", 200*(2/3) + left + speedLimWidth/2 + width/2, textTopY);
      ctx.font = "700 " + 50*(4/3) + "px Open Sans";
      ctx.fillText(Math.floor(turnSpeed), 200*(2/3) + left + speedLimWidth/2 + width/2, textBottomY);
    }

    // Speed Limit
    if (!isSpeedLimitValid) {
      speedLimWidth -= Math.floor(5*(2/3));
      height -= Math.floor(10*(2/3)) + 4;
      left += Math.floor(9*(2/3)) - 1;
      top += Math.floor(5*(2/3)) + 2;
    }

    var speedLimBorderRadius = isSpeedLimitValid ? 30 : 15;
    // background
    var speedLimFillStyle;

    if (isSpeedLimitValid && isEgoOverLimit) {
      speedLimFillStyle = "rgba(218, 111, 37, 0.706)";
    } else if (isSpeedLimitValid) {
      speedLimFillStyle = "rgba(255, 255, 255, 1.0)";
    } else {
      speedLimFillStyle = "rgba(255, 255, 255, 0.392)";
    }
    fillRoundedRect(ctx, left, top, speedLimWidth, height, speedLimBorderRadius, speedLimFillStyle);

    // border
    if (isSpeedLimitValid) {
      var speedLimStrokeStyle;
      if (isEgoOverLimit) {
        speedLimStrokeStyle = "rgba(218, 111, 37, 1.0)";
      } else {
        speedLimStrokeStyle = "rgba(255, 255, 255, 1.0)";
      }
      strokeRoundedRect(ctx, left, top, speedLimWidth, height, 20, 10, speedLimStrokeStyle);
    }

    ctx.font = "600 " + 50*(2/3) + "px Open Sans";
    if (isSpeedLimitValid && isEgoOverLimit) {
      ctx.fillStyle = "rgba(255,255,255,1.0)";
    } else {
      ctx.fillStyle = "rgba(0,0,0,1.0)";
    }
    ctx.fillText("SPEED",
                 left + speedLimWidth/2 + 2,
                 top + (2/3)*(isSpeedLimitValid ? 35 : 30));
    ctx.fillText("LIMIT",
                 left + speedLimWidth/2,
                 top + (2/3)*(isSpeedLimitValid ? 80 : 75));


    if (isEgoOverLimit) {
      ctx.fillStyle = "rgba(255,255,255,1.0)";
    } else {
      ctx.fillStyle = "rgba(0,0,0,1.0)";
    }
    if (isSpeedLimitValid) {
      ctx.font = "700 " + 48*(4/3) + "px Open Sans";
      ctx.fillText(Math.floor(speedLimitCalc),
                   left + speedLimWidth / 2,
                   textBottomY + 3);
    } else {
      ctx.font = "600 " + 42*(4/3) + "px Open Sans";
      ctx.fillText("N/A",
                   left + speedLimWidth / 2,
                   textBottomY + 3);
    }
  }

  drawCarStateWheel (options, CarState) {
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
  renderDriverMonitoring (options, events) {
    if (!events.driverMonitoring) {
      return;
    }

    var { ctx } = options;
    let driverMonitoring = events.driverMonitoring.DriverMonitoring;

    if (driverMonitoring.FaceProb < 0.8) {
      return;
    }

    let xW = vwp_h / 2;
    let xOffset = vwp_w - xW;
    let noseSize = 20;
    ctx.translate(xOffset, 0);

    let isDistracted = this.isDistracted(driverMonitoring);

    let opacity = (driverMonitoring.FaceProb - DM_FACE_THRESHOLD) / (1 - DM_FACE_THRESHOLD) * 255;
    noseSize *= 1 / (driverMonitoring.FaceProb);
    let [x, y] = driverMonitoring.FacePosition.map(v => v + 0.5);
    x = toX(x);
    y = toY(y);

    let flatMatrix = this.rot_matrix(...driverMonitoring.FaceOrientation)
      .reduce((m, v) => m.concat([...v, 1]), [])
      .concat([0,0,0,1]);
    flatMatrix[3] = x;
    flatMatrix[7] = y;

    let p1 = this.matmul(flatMatrix, [0, 0, 0, 1]);
    let p2 = this.matmul(flatMatrix, [0, 0, 100, 1]);

    let isBlinking = false;

    if (driverMonitoring.LeftBlinkProb > DM_BLINK_THRESHOLD || driverMonitoring.RightBlinkProb > DM_BLINK_THRESHOLD) {
      isBlinking = true;
    }

    ctx.lineWidth = 3;
    ctx.beginPath();
    if (isDistracted) {
      ctx.strokeStyle = 'rgba(255, 0, 0, ' + opacity + ')';
    } else if (isBlinking) {
      ctx.strokeStyle = 'rgba(255, 255, 0, ' + opacity + ')';
    } else {
      ctx.strokeStyle = 'rgba(0, 255, 0, ' + opacity + ')';
    }
    ctx.arc(x, y, noseSize, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.closePath();

    // print raw and converted values, useful for debugging but super not pretty
    // ctx.fillStyle = 'rgb(255,255,255)';
    // ctx.font = '800 14px Open Sans';
    // ctx.fillText(driverMonitoring.FaceOrientation[2], x + noseSize * 2, y);
    // ctx.fillText(driverMonitoring.FaceOrientation[1], x, y + noseSize * 2);

    // let pose = this.getDriverPose(driverMonitoring);

    // ctx.fillText(pose.yaw, x + noseSize * 2, y + noseSize / 2);
    // ctx.fillText(pose.pitch, x, y + noseSize * 2.5);

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.palette.states.drivingBlue;
    ctx.moveTo((p1[0]), (p1[1]));
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + opacity + ')';
    ctx.lineTo((p2[0]), (p2[1]));
    ctx.stroke();
    ctx.closePath();

    function toX (x) {
      return (x * xW);
    }
    function toY (y) {
      return (y * vwp_h);
    }
  }
  isDistracted (driverMonitoring) {
    let pose = this.getDriverPose(driverMonitoring);

    let pitch_error = pose.pitch - _PITCH_NATURAL_OFFSET
    let yaw_error = pose.yaw - _YAW_NATURAL_OFFSET
    if (pitch_error > 0) {
      pitch_error = Math.max(pitch_error - _PITCH_POS_ALLOWANCE, 0);
    }

    pitch_error *= _PITCH_WEIGHT;
    let pose_metric = Math.sqrt(Math.pow(yaw_error, 2) + Math.pow(pitch_error, 2));
    if (pose_metric > _METRIC_THRESHOLD) {
      return true;
    }
    return false;
  }
  getDriverPose (driverMonitoring) {
    // use driver monitoring units instead of canvas units
    // that way code can be nearly identical
    const angles_desc = driverMonitoring.FaceOrientation;
    const pos_desc = driverMonitoring.FacePosition;

    let pitch_prnet = angles_desc[0];
    let yaw_prnet = angles_desc[1];
    let roll_prnet = angles_desc[2];

    let face_pixel_position = [(pos_desc[0] + .5)*W - W + FULL_W, (pos_desc[1]+.5)*H];
    let yaw_focal_angle = Math.atan2(face_pixel_position[0] - FULL_W/2, RESIZED_FOCAL)
    let pitch_focal_angle = Math.atan2(face_pixel_position[1] - H/2, RESIZED_FOCAL)

    let roll = roll_prnet
    let pitch = pitch_prnet + pitch_focal_angle
    let yaw = -yaw_prnet + yaw_focal_angle
    return { roll, pitch, yaw };
  }

  carSpaceToImageSpace (coords) {
    coords = this.matmul(this.extrinsic, coords);
    coords = this.matmul(this.intrinsic, coords);

    // project onto 3d with Z
    coords[0] /= coords[2];
    coords[1] /= coords[2];

    return coords;
  }
  rot_matrix (roll, pitch, yaw) {
    let cr = Math.cos(roll);
    let sr = Math.sin(roll);
    let cp = Math.cos(pitch);
    let sp = Math.sin(pitch);
    let cy = Math.cos(yaw);
    let sy = Math.sin(yaw);

    let rr = [
      [1,0,0],
      [0, cr,-sr],
      [0, sr, cr]
    ];
    let rp = [
      [cp,0,sp],
      [0, 1,0],
      [-sp, 0, cp]
    ];
    let ry = [
      [cy,-sy,0],
      [sy, cy,0],
      [0, 0, 1]
    ];
    return multiply(ry, multiply(rp, rr));
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
    let segment = this.props.currentSegment;
    if (!segment && this.props.nextSegment) {
      let offset = TimelineWorker.currentOffset();
      if (this.props.nextSegment.startOffset - offset < 5000) {
        segment = this.props.nextSegment;
      }
    }
    if (!segment) {
      return '';
    }
    let base = process.env.REACT_APP_VIDEO_CDN + '/hls/' + this.props.dongleId + '/' + segment.url.split('/').pop();
    if (this.props.front) {
      base += '/dcamera';
    }

    // We append count of segments with stream available as a cache-busting method
    // on stream indexes served before route is fully uploaded
    let segCount;
    if (this.props.front) {
      segCount = segment.driverCameraStreamSegCount;
    } else {
      segCount = segment.cameraStreamSegCount;
    }
    return base + '/index.m3u8' + '?v=' + STREAM_VERSION + '&s=' + segCount;
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
    if (this.props.playSpeed !== this.props.desiredPlaySpeed && !this.props.isBuffering) {
      console.log(this.props);
      debugger;
    }
    return (
      <div
        className={ classNames(classes.videoContainer, {
          [classes.hidden]: false // this.state.noVideo
        }) }>
        { this.props.isBuffering &&
          <Buffering
            bufferingVideo={ this.props.bufferingVideo }
            bufferingData={ this.props.bufferingData }
            onDisableBuffering={ this.onDisableBuffering }
            />
        }
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
            onBufferAppend={ this.checkVideoBuffer }
            onSourceLoaded={ this.onSourceLoaded }
            isVideoChild />
          <ControlBar disabled />
        </Player>
        { !this.props.front &&
          <img
            ref={ this.imageRef }
            className={ classes.videoImage }
            src={this.nearestImageFrame()} />
        }
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
            <canvas
              ref={ this.canvas_maxspeed }
              className={ classes.videoUiCanvas }
              style={{ zIndex: 6 }} />
            <canvas
              ref={ this.canvas_speed }
              className={ classes.videoUiCanvas }
              style={{ zIndex: 7 }} />
          </React.Fragment>
        }
        { this.props.front &&
          <React.Fragment>
            <canvas
              ref={ this.canvas_face }
              className={ classes.videoUiCanvas }
              style={{ zIndex: 2 }} />
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
