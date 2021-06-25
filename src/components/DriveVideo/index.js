/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import { classNames } from 'react-extras';
import debounce from 'debounce';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player'
import Hls from '@commaai/hls.js';

import { video as VideoApi } from '@commaai/comma-api';

import theme from '../../theme';
import TimelineWorker from '../../timeline';
import * as LogIndex from '../../timeline/logIndex';
import { strokeRoundedRect, fillRoundedRect } from './canvas';
import Buffering from './buffering';

window.Hls = Hls;

// UI Assets
const wheelImg = new Image();
wheelImg.src = require('../../icons/icon-chffr-wheel.svg');

// these constants are named this way so that the names are the same in python and js
// do not refactor them to have js style or more descriptive names
// UI Measurements

const tici_vwp_w = 1928;
const tici_vwp_h = 1208;
const tici_focal = 2648;

const eon_vwp_w = 1164;
const eon_vwp_h = 874;
const eon_focal = 910;

const tici_intrinsic = [
  tici_focal, 0, tici_vwp_w/2, 0,
  0, tici_focal, tici_vwp_h/2, 0,
  0, 0, 1, 0,
  0, 0, 0, 0,
];
const eon_intrinsic = [
  eon_focal, 0, eon_vwp_w/2, 0,
  0, eon_focal, eon_vwp_h/2, 0,
  0, 0, 1, 0,
  0, 0, 0, 0,
];

const bdr_s = 30;
// driver monitoring constants

const styles = (theme) => ({
  hidden: {
    display: 'none'
  },
  videoContainer: {
    minHeight: 200,
    position: 'relative',
    maxWidth: 964,
    margin: '0 auto',
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
});

function is_tici(init_data) {
  return init_data.InitData.DeviceType == 4;
}

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.updatePreview = this.updatePreview.bind(this);
    this.visibleSegment = this.visibleSegment.bind(this);

    this.videoPlayer = React.createRef();
    this.canvas_road = React.createRef();
    this.canvas_lead = React.createRef();
    this.canvas_carstate = React.createRef();
    this.canvas_maxspeed = React.createRef();
    this.canvas_speed = React.createRef();
    this.canvas_face = React.createRef();

    this.intrinsic = eon_intrinsic;
    this.vwp_w = eon_vwp_w;
    this.vwp_h = eon_vwp_h;

    this.frame = 0;

    this.state = {
      src: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.rafLoop = raf(this.updatePreview);
    this.updateVideoSource({});
    this.syncVideo();
    this.checkDataBuffer();
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
    this.checkDataBuffer();
  }

  componentWillUnmount() {
    if (this.rafLoop) {
      raf.cancel(this.rafLoop);
      this.rafLoop = null;
    }
  }

  visibleSegment(props = this.props) {
    if (props.currentSegment) {
      return props.currentSegment;
    }
    const offset = TimelineWorker.currentOffset();
    if (props.nextSegment && props.nextSegment.startOffset - offset < 5000) {
      return props.nextSegment;
    }
    return null;
  }

  updateVideoSource(prevProps) {
    const segment = this.visibleSegment();
    if (!segment) {
      if (this.state.src !== '') {
        this.setState({ src: '' });
      }
      return;
    }

    const prevSegment = this.visibleSegment(prevProps);
    if (this.state.src === '' || !prevSegment || prevSegment.route !== segment.route) {
      let videoApi = VideoApi(segment.url, process.env.REACT_APP_VIDEO_CDN);
      videoApi.getQcameraStreamIndex().then(() => {
        let src = videoApi.getQcameraStreamIndexUrl() + `?s=${segment.cameraStreamSegCount}`
        if (src !== this.state.src) {
          this.setState({src});
          this.syncVideo();
        }
      }).catch((err) => {
        console.log(err);
        let src = videoApi.getRearCameraStreamIndexUrl() + `?s=${segment.cameraStreamSegCount}`;
        if (src !== this.state.src) {
          this.setState({src});
          this.syncVideo();
        }
      });
    }
  }

  updatePreview() {
    // schedule next run right away so that we can return early
    this.rafLoop = raf(this.updatePreview);

    this.frame++;
    if (this.frame % 30 === 0) {
      this.syncVideo();
    }
    if (this.frame % 6 === 0) {
      this.checkDataBuffer();
    }
    if (this.frame % 6 === 3) {
      this.renderCanvas();
    }
  }

  checkDataBuffer = debounce(() => {
    if (!this.props.shouldShowUI) {
      if (this.props.isBufferingData) {
        TimelineWorker.bufferData(false);
      }
      return;
    }

    const logIndex = TimelineWorker.getLogIndex();
    if (!logIndex) {
      return;
    }

    let isDataBuffering = true;
    const monoTime = TimelineWorker.currentLogMonoTime();
    const monoTimeLength = (`${monoTime}`).length;
    const curIndex = LogIndex.findMonoTime(logIndex, monoTime);
    const lastEvent = TimelineWorker.getEvent(curIndex, logIndex);
    let nextEvent = TimelineWorker.getEvent(curIndex + 1, logIndex);

    if (!nextEvent) {
      nextEvent = TimelineWorker.getEvent(0, TimelineWorker.getNextLogIndex());
    }

    if (nextEvent && nextEvent.LogMonoTime) {
      const nextEventTime = Number(nextEvent.LogMonoTime.substr(0, monoTimeLength));
      const timeDiff = Math.abs(nextEventTime - monoTime);

      isDataBuffering = timeDiff > 1000;
    }
    if (isDataBuffering && lastEvent && lastEvent.LogMonoTime) {
      const monSec = lastEvent.LogMonoTime.substr(0, monoTimeLength);
      const timeDiff = Math.abs(monoTime - Number(monSec));
      // 3 seconds of grace
      isDataBuffering = timeDiff > 3000;
    }

    if (isDataBuffering !== this.props.isBufferingData) {
      TimelineWorker.bufferData(isDataBuffering);
    }
  }, 100)

  syncVideo = debounce(() => {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !this.visibleSegment() || !videoPlayer.getDuration()) {
      return;
    }

    const internalPlayer = videoPlayer.getInternalPlayer();

    // sanity check required for ios
    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (hasSufficientBuffer && this.props.isBufferingVideo) {
      TimelineWorker.bufferVideo(false);
    }

    let newPlaybackRate = this.props.isBufferingData ? 0 : this.props.desiredPlaySpeed;
    if (!this.props.isBufferingData || internalPlayer.playbackRate === 0) {
      let desiredVideoTime = this.currentVideoTime();
      const curVideoTime = videoPlayer.getCurrentTime();
      const timeDiff = desiredVideoTime - curVideoTime;
      if (Math.abs(timeDiff) <= 0.3) {
        newPlaybackRate = Math.max(0, newPlaybackRate + timeDiff)
      } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== videoPlayer.getDuration()) {
        // logs start ealier than video, so skip to video ts 0
        TimelineWorker.seek(TimelineWorker.currentOffset() - (timeDiff * 1000));
      } else {
        videoPlayer.seekTo(desiredVideoTime, 'seconds');
      }
    }

    newPlaybackRate = Math.round(newPlaybackRate * 10) / 10;
    if (internalPlayer.playbackRate !== newPlaybackRate) {
      internalPlayer.playbackRate = newPlaybackRate;
    }

    // pausing and unpausing is required on some browsers
    if (internalPlayer.paused && internalPlayer.playbackRate !== 0 && hasSufficientBuffer) {
      internalPlayer.play();
    } else if (!internalPlayer.paused && internalPlayer.playbackRate === 0) {
      internalPlayer.pause();
    }
  }, 100)

  renderCanvas() {
    const calibration = TimelineWorker.getCalibration(this.props.route);
    if (!calibration) {
      this.lastCalibrationTime = false;
      return;
    }

    if (!this.props.shouldShowUI) {
      return;
    }

    if (calibration) {
      if (this.lastCalibrationTime !== calibration.LogMonoTime) {
        this.extrinsic = [...calibration.LiveCalibration.ExtrinsicMatrix, 0, 0, 0, 1];
      }
      this.lastCalibrationTime = calibration.LogMonoTime;
    }
    let init_data = TimelineWorker.currentInitData();
    if (init_data){
      if (is_tici(init_data)) {
        this.intrinsic = tici_intrinsic;
        this.vwp_w = tici_vwp_w;
        this.vwp_h = tici_vwp_h;
      }
    }

    let live_calibration = TimelineWorker.currentLiveCalibration();
    if (live_calibration) {
      this.extrinsic = [...live_calibration.LiveCalibration.ExtrinsicMatrix, 0, 0, 0, 1];
    }

    if (this.canvas_road.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        model: TimelineWorker.currentModel,
        modelv2: TimelineWorker.currentModelV2,
        mpc: TimelineWorker.currentMPC,
        controlsState: TimelineWorker.currentControlsState,
      };
      this.renderEventToCanvas(
        this.canvas_road.current, params, events, this.drawLaneFull
      );
    }
    if (this.canvas_lead.current) {
      const params = { calibration, shouldScale: true };
      const events = { radarState: TimelineWorker.currentRadarState };
      this.renderEventToCanvas(
        this.canvas_lead.current, params, events, this.renderLeadCars
      );
    }
    if (this.canvas_carstate.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        carState: TimelineWorker.currentCarState,
        controlsState: TimelineWorker.currentControlsState,
      };
      this.renderEventToCanvas(
        this.canvas_carstate.current, params, events, this.renderCarState
      );
    }
    if (this.canvas_maxspeed.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        controlsState: TimelineWorker.currentControlsState,
        initData: TimelineWorker.currentInitData,
      };
      this.renderEventToCanvas(
        this.canvas_maxspeed.current, params, events, this.renderMaxSpeed
      );
    }
    if (this.canvas_speed.current) {
      const params = { calibration, shouldScale: true };
      const events = {
        carState: TimelineWorker.currentCarState,
        initData: TimelineWorker.currentInitData,
      };
      this.renderEventToCanvas(
        this.canvas_speed.current, params, events, this.renderSpeed
      );
    }
  }

  renderEventToCanvas(canvas, params, events, renderEvent) {
    const { width, height } = canvas.getBoundingClientRect();

    if (!params.calibration) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      return; // loading calibration from logs still...
    }

    let logTime; let
      monoIndex;
    const _events = {};
    let needsRender = false;
    const eventsSig = Object.keys(events).join(',');
    Object.keys(events).map((key) => {
      const event = events[key].apply(TimelineWorker);
      monoIndex = `${events[key].name}MonoTime${eventsSig}`;

      if (!event) {
        if (this[monoIndex]) {
          this[monoIndex] = false;
          const ctx = canvas.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, width, height);
          // we have to force re-render when one is missing
          // this is because there's more than one event being rendered through this flow
          // this should be re-broken apart such that this isn't an issue
          // fixing that will also reduce the rendering complexity
          needsRender = true;
        }
      } else {
        logTime = event ? event.LogMonoTime : null;
        needsRender = needsRender || logTime !== this[monoIndex];
        this[monoIndex] = logTime;
        _events[key] = event;
      }
    });

    if (!needsRender) {
      return;
    }
    // will render!
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // clear all the data
    ctx.clearRect(0, 0, width, height);
    // reset transform before anything, just in case
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // scale original coords onto our current size
    if (params.shouldScale) {
      ctx.scale(width / this.vwp_w, height / this.vwp_h);
    }

    renderEvent.apply(this, [{ width, height, ctx }, _events]);
  }

  renderLeadCars(options, events) {
    if (!events.radarState) {
      return;
    }
    this.lastRadarStateMonoTime = events.radarState.LogMonoTime;
    const { width, height, ctx } = options;

    const leadOne = events.radarState.RadarState.LeadOne;
    const leadTwo = events.radarState.RadarState.LeadTwo;

    if (leadOne.Status) {
      this.renderLeadCar(options, leadOne);
    }
    if (leadTwo.Status) {
      this.renderLeadCar(options, leadTwo, true);
    }
  }

  renderLeadCar(options, leadData, is2ndCar) {
    const { width, height, ctx } = options;

    const drel = leadData.DRel;
    const vrel = leadData.VRel;
    const yrel = leadData.YRel;

    var x = drel + 2.7;
    var y = yrel;

    var [x, y, z] = this.carSpaceToImageSpace([drel + 2.7, yrel, 0, 1]);

    if (x < 0 || y < 0) {
      return;
    }

    let sz = 25 * 30;
    sz /= ((drel + 2.7) / 3 + 30);
    sz = Math.min(Math.max(sz, 15), 30);
    if (is2ndCar) {
      sz /= 1.2;
    }

    let fillAlpha = 0;
    const speedBuff = 10;
    const leadBuff = 40;

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
    const g_xo = sz / 5;
    const g_yo = sz / 10;
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
      ctx.fillStyle = `rgba(201, 34, 49, ${fillAlpha})`;

      ctx.beginPath();
      ctx.moveTo(x + (sz * 1.25), y + sz);
      ctx.lineTo(x, y);
      ctx.lineTo(x - (sz * 1.25), y + sz);
      ctx.lineTo(x + (sz * 1.25), y + sz);
      ctx.fill();
    }
  }

  drawLaneFull(options, events) { // ui_draw_vision_lanes
    const { ctx } = options;
    if (events) {
      if (events.modelv2) {
        this.drawLaneBoundaryV2(ctx, events.modelv2.ModelV2.LaneLines, events.modelv2.ModelV2.LaneLineProbs, false);
        this.drawLaneBoundaryV2(ctx, events.modelv2.ModelV2.RoadEdges, events.modelv2.ModelV2.RoadEdgeStds, true);
        this.drawLaneTrackV2(ctx, events.modelv2.ModelV2.Position);
      } else if (events.model) {
        this.drawLaneBoundary(ctx, events.model.Model.LeftLane);
        this.drawLaneBoundary(ctx, events.model.Model.RightLane);
        this.drawLaneTrack(options, events.model.Model.Path);
      } else if (events.mpc && events.controlsState) {
        this.drawLaneTrack(options, events.mpc.LiveMpc, {
          isMpc: true,
          isEnabled: events.controlsState.ControlsState.Enabled,
        });
      }
    }
  }

  drawLaneBoundary(ctx, lane) { // ui_draw_lane
    let color = `rgba(255, 255, 255,${lane.Prob})`;

    let points;
    if (lane.Points.length > 0) {
      points = lane.Points;
    } else {
      points = [];
      for (let i = 0; i < 192; i++) {
        points.push(lane.Poly[0] * (i * i * i) + lane.Poly[1] * (i * i) + lane.Poly[2] * i + lane.Poly[3]);
      }
    }
    this.drawLaneLine(ctx, points, 0.035 * lane.Prob, color, false);
    const offset = Math.min(lane.Std, 0.7);
    color = `rgba(255, 255, 255,${lane.Prob})`;
    this.drawLaneLine(ctx, points, -offset, color, true);
    this.drawLaneLine(ctx, points, offset, color, true);
  }

  drawLaneLine(ctx, points, off, color, isGhost) { // ui_draw_lane_line
    ctx.beginPath();
    let started = false;
    const line_height = 49;
    for (let i = 0; i < line_height; i++) {
      const px = i;
      const py = points[i] - off;
      const [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
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
    for (let i = line_height; i > 0; i--) {
      const px = i == line_height ? line_height : i;
      const py = isGhost ? (points[i] - off) : (points[i] + off);
      const [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
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

  drawLaneBoundaryV2(ctx, lines, certainty, isStds) {
    for (let i = 0; i < lines.length; i++) {
      const opacity = !isStds ? certainty[i] : 1.0 - certainty[i];
      const color = !isStds ? "255, 255, 255" : "255, 0, 0";
      const rgba = `rgba(${color}, ${Math.min(Math.max(opacity, 0.0), 1.0)})`;
      this.drawLaneLineV2(ctx, lines[i], 0.035, rgba);
    }
  }

  drawLaneLineV2(ctx, points, off, color, isGhost) {
    ctx.beginPath();
    let started = false;
    let z_off = 1.22;

    for (let i = 0; i < points.X.length; i++) {
      const px = points.X[i];
      const py = -points.Y[i] - off;
      const pz = -points.Z[i];
      const [x, y, z] = this.carSpaceToImageSpace([px, py, pz + z_off, 1.0]);
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
    for (let i = points.X.length-1; i >= 0; i--) {
      const px = points.X[i];
      const py = isGhost ? (-points.Y[i] - off) : (-points.Y[i] + off);
      const pz = -points.Z[i];
      const [x, y, z] = this.carSpaceToImageSpace([px, py, pz + z_off, 1.0]);
      if (y < 0) {
        continue;
      }
      ctx.lineTo(x, y);
    }
    if (!isGhost) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.1;
      ctx.stroke();
    }
  }

  drawLaneTrack(options, path, params) {
    const { ctx } = options;
    let isMpc; let
      isEnabled;
    if (params) {
      isMpc = params.isMpc;
      isEnabled = params.isEnabled;
    }
    ctx.beginPath();
    let started = false;
    const offset = isMpc ? 0.3 : 0.5;
    const path_height = isMpc ? 20 : 49;
    let points;
    if (path.Points.length > 0) {
      points = path.Points;
    } else {
      points = [];
      for (let i = 0; i < 192; i++) {
        points.push(path.Poly[0] * (i * i * i) + path.Poly[1] * (i * i) + path.Poly[2] * i + path.Poly[3]);
      }
    }
    for (let i = 0; i <= path_height; i++) {
      let px; let
        py;
      if (isMpc) {
        px = path.X[i];
        py = path.Y[i] - offset;
      } else {
        px = i;
        py = points[i] - offset;
      }
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (i === 0) {
        y = this.vwp_h;
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
    for (let i = path_height; i >= 0; i--) {
      let px; let
        py;
      if (isMpc) {
        px = path.X[i];
        py = path.Y[i] + offset;
      } else {
        px = i;
        py = points[i] + offset;
      }
      let [x, y, z] = this.carSpaceToImageSpace([px, py, 0.0, 1.0]);
      if (i === 0) {
        y = this.vwp_h;
      } else if (y < 0) {
        continue;
      }
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    let track_bg;
    if (isMpc) {
      track_bg = ctx.createLinearGradient(this.vwp_w, this.vwp_h - 40, this.vwp_w, this.vwp_h * 0.4);
      if (isEnabled) {
        track_bg.addColorStop(0, 'rgba(23, 134, 68, 0.8)');
        track_bg.addColorStop(1, 'rgba(14, 89, 45, 0.8)');
      } else {
        track_bg.addColorStop(0, 'rgba(23, 88, 134, 0.6)');
        track_bg.addColorStop(1, 'rgba(15, 58, 89, 0.6)');
      }
    } else {
      track_bg = ctx.createLinearGradient(this.vwp_w, this.vwp_h, this.vwp_w, this.vwp_h * 0.5);
      track_bg.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      track_bg.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    }
    ctx.fillStyle = track_bg;
    ctx.fill();
  }

  drawLaneTrackV2(ctx, points) {
    ctx.beginPath();
    let started = false;
    const offset = 0.5;

    for (let i = 0; i <= points.X.length; i++) {
      const px = points.X[i];
      const py = -points.Y[i] - offset;
      const pz = -points.Z[i];
      let [x, y, z] = this.carSpaceToImageSpace([px, py, pz, 1.0]);
      if (i === 0) {
        y = this.vwp_h;
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
    for (let i = points.X.length-1; i >= 0; i--) {
      const px = points.X[i];
      const py = -points.Y[i] + offset;
      const pz = -points.Z[i];
      let [x, y, z] = this.carSpaceToImageSpace([px, py, pz, 1.0]);
      if (i === 0) {
        y = this.vwp_h;
      } else if (y < 0) {
        continue;
      }
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    let track_bg;
    track_bg = ctx.createLinearGradient(this.vwp_w, this.vwp_h, this.vwp_w, this.vwp_h * 0.5);
    track_bg.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    track_bg.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = track_bg;
    ctx.fill();
  }

  renderCarState(options, events) {
    if (events && events.carState && events.controlsState) {
      this.drawCarStateBorder(options, events.controlsState.ControlsState);
      this.drawCarStateWheel(options, events.carState.CarState, events.controlsState.ControlsState);
    }
  }

  renderSpeed(options, events) {
    if (events && events.carState && events.initData) {
      this.drawSpeed(options, events.carState.CarState, events.initData.InitData);
    }
  }

  drawSpeed(options, CarState, InitData) {
    const { ctx } = options;

    let speed = CarState.VEgo;

    const metricParam = InitData.Params.Entries.find((entry) => entry.Key === 'IsMetric');
    const isMetric = metricParam && metricParam.Value === '1';
    if (isMetric) {
      speed = Math.floor(speed * 3.6 + 0.5);
    } else {
      speed = Math.floor(speed * 2.2369363 + 0.5);
    }

    const x = this.vwp_w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 128px \'Open Sans\', sans-serif';
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillText(speed, x, 140);

    ctx.font = '400 48px \'Open Sans\', sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,200)';
    if (isMetric) {
      ctx.fillText('km/h', x, 210);
    } else {
      ctx.fillText('mph', x, 210);
    }
  }

  renderMaxSpeed(options, events) {
    if (events && events.controlsState && events.initData) {
      this.drawMaxSpeed(options, events.controlsState.ControlsState, events.initData.InitData);
    }
  }

  drawMaxSpeed(options, ControlsState, InitData) {
    const { ctx } = options;

    const maxSpeed = ControlsState.VCruise;
    let maxSpeedCalc = maxSpeed * 0.6225 + 0.5;

    const metricParam = InitData.Params.Entries.find((entry) => entry.Key === 'IsMetric');
    if (metricParam && metricParam.Value === '1') {
      maxSpeedCalc = maxSpeed + 0.5;
    }

    const isCruiseSet = !isNaN(ControlsState.VCruise) && ControlsState.VCruise != 0 && ControlsState.VCruise != 255;

    const width = Math.floor(184 * (2 / 3));
    let height = Math.floor(202 * (2 / 3));

    let left = bdr_s * 2;
    let top = bdr_s * 2;

    // background
    fillRoundedRect(ctx, left, top, width, height, 30, 'rgba(0, 0, 0, 0.392)');

    // border
    strokeRoundedRect(ctx, left, top, width, height, 30, 10, 'rgba(255, 255, 255, 0.392)');

    const textTopY = top + (26 * 4 / 3);
    const textBottomY = textTopY + (48 * (4 / 3));
    // MAX text
    ctx.font = `${26 * (4 / 3)}px \'Open Sans\', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (isCruiseSet) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.784)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.392)';
    }

    ctx.fillText('MAX', left + width / 2, textTopY);

    // max speed text
    if (isCruiseSet) {
      ctx.font = `700 ${48 * (4 / 3)}px \'Open Sans\', sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.fillText(Math.floor(maxSpeedCalc), 2 + left + width / 2, textBottomY);
    } else {
      ctx.font = `600 ${42 * (4 / 3)}px \'Open Sans\', sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.392)';
      ctx.fillText('N/A', left + width / 2, textBottomY);
    }
  }

  drawCarStateWheel(options, CarState, ControlsState) {
    const { ctx } = options;

    const radius = 80;
    const wheelRadius = radius - (bdr_s / 2);
    const x = this.vwp_w - radius - (bdr_s * 2);
    const y = radius + (bdr_s * 2);

    // Wheel Background
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    if (ControlsState.Enabled) {
      ctx.fillStyle = theme.palette.states.engagedGreen;
    } else {
      ctx.fillStyle = theme.palette.states.drivingBlue;
    }
    ctx.closePath();
    ctx.fill();

    // Rotate Wheel
    ctx.translate(x, y);
    ctx.rotate(0 - CarState.SteeringAngleDeg * Math.PI / 180);
    ctx.translate(-x, -y);

    // Wheel Image
    ctx.drawImage(wheelImg, x - wheelRadius, y - wheelRadius, 2 * wheelRadius, 2 * wheelRadius);
  }

  drawCarStateBorder(options, ControlsState) {
    const { ctx } = options;
    ctx.lineWidth = bdr_s * 2;

    if (ControlsState.Enabled) {
      ctx.strokeStyle = theme.palette.states.engagedGreen;
    } else {
      ctx.strokeStyle = theme.palette.states.drivingBlue;
    }
    ctx.strokeRect(0, 0, this.vwp_w, this.vwp_h);
  }

  carSpaceToImageSpace(coords) {
    coords = this.matmul(this.extrinsic, coords);
    coords = this.matmul(this.intrinsic, coords);

    // project onto 3d with Z
    coords[0] /= coords[2];
    coords[1] /= coords[2];
    return coords;
  }

  matmul(matrix, coord) {
    const b0 = coord[0]; const b1 = coord[1]; const b2 = coord[2]; const
      b3 = coord[3];

    coord[0] = b0 * matrix[0] + b1 * matrix[1] + b2 * matrix[2] + b3 * matrix[3];
    coord[1] = b0 * matrix[4] + b1 * matrix[5] + b2 * matrix[6] + b3 * matrix[7];
    coord[2] = b0 * matrix[8] + b1 * matrix[9] + b2 * matrix[10] + b3 * matrix[11];
    coord[3] = b0 * matrix[12] + b1 * matrix[13] + b2 * matrix[14] + b3 * matrix[15];

    return coord;
  }

  currentVideoTime(offset = TimelineWorker.currentOffset()) {
    if (!this.visibleSegment()) {
      return 0;
    }
    offset -= this.visibleSegment().routeOffset;
    offset = offset / 1000;

    let initData = TimelineWorker.currentInitData();
    let firstFrameTime = TimelineWorker.firstFrameTime();

    if (initData !== null && firstFrameTime !== null) {
      offset -= (firstFrameTime - initData.LogMonoTime/1e9);
    }

    return Math.max(0, offset);
  }

  render() {
    const { classes, isBufferingData, isBufferingVideo } = this.props;
    const playSpeed = isBufferingData ? 0 : this.props.desiredPlaySpeed;
    return (
      <div className={classNames(classes.videoContainer, { [classes.hidden]: false })}>
        { (isBufferingData || isBufferingVideo) &&
          <Buffering isBufferingVideo={ isBufferingVideo } isBufferingData={ isBufferingData } />
        }
        <ReactPlayer ref={ this.videoPlayer } url={ this.state.src } playsinline={ true } muted={ true }
          width="100%" height="unset" playing={ Boolean(this.visibleSegment()) && Boolean(playSpeed) }
          config={{ hlsOptions: { enableWorker: false, disablePtsDtsCorrectionInMp4Remux: false } }}
          playbackRate={ playSpeed }
          onBuffer={ () => TimelineWorker.bufferVideo(true) }
          onBufferEnd={ () => TimelineWorker.bufferVideo(false) }
          onPlay={ () => TimelineWorker.bufferVideo(false) } />
        { this.props.shouldShowUI &&
          <>
            <canvas style={{ zIndex: 3 }} className={classNames(classes.videoUiCanvas, 'hudRoadCanvas')}
              ref={this.canvas_road} />
            <canvas className={classes.videoUiCanvas} style={{ zIndex: 4 }} ref={this.canvas_lead} />
            <canvas className={classes.videoUiCanvas} style={{ zIndex: 5 }} ref={this.canvas_carstate} />
            <canvas className={classes.videoUiCanvas} style={{ zIndex: 6 }} ref={this.canvas_maxspeed} />
            <canvas className={classes.videoUiCanvas} style={{ zIndex: 7 }} ref={this.canvas_speed} />
          </>
        }
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  currentSegment: 'workerState.currentSegment',
  nextSegment: 'workerState.nextSegment',
  desiredPlaySpeed: 'workerState.desiredPlaySpeed',
  route: 'workerState.route',
  segment: 'workerState.segment',
  offset: 'workerState.offset',
  startTime: 'workerState.startTime',
  isBufferingVideo: 'workerState.isBufferingVideo',
  isBufferingData: 'workerState.isBufferingData',
});

export default connect(stateToProps)(withStyles(styles)(DriveVideo));
