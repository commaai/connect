/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import { classNames } from 'react-extras';
import { multiply } from 'mathjs';
import debounce from 'debounce';
import PropTypes from 'prop-types';

import { Player, ControlBar } from 'video-react';
import 'video-react/dist/video-react.css'; // CSS for video
import { video as VideoApi } from '@commaai/comma-api';

import theme from '../../theme';
import HLSSource from './hlsSource';
import TimelineWorker from '../../timeline';
import * as LogIndex from '../../timeline/logIndex';
import { strokeRoundedRect, fillRoundedRect } from './canvas';
import Buffering from './buffering';

// UI Assets
const wheelImg = new Image();
wheelImg.src = require('../../icons/icon-chffr-wheel.svg');

// these constants are named this way so that the names are the same in python and js
// do not refactor them to have js style or more descriptive names
// UI Measurements

const tici_vwp_w = 1928;
const tici_vwp_h = 1208;
const tici_focal = 2648;
const tici_video_height = 530;

const eon_vwp_w = 1164;
const eon_vwp_h = 874;
const eon_focal = 910;
const eon_video_height = 640;

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
const _PITCH_NATURAL_OFFSET = 0.12; // eslint-disable-line no-underscore-dangle
const _YAW_NATURAL_OFFSET = 0.08; // eslint-disable-line no-underscore-dangle
const _PITCH_POS_ALLOWANCE = 0.04; // eslint-disable-line no-underscore-dangle
const _PITCH_WEIGHT = 1.35; // eslint-disable-line no-underscore-dangle
const _METRIC_THRESHOLD = 0.4; // eslint-disable-line no-underscore-dangle
const W = 160;
const H = 320;
const RESIZED_FOCAL = 320.0;
const FULL_W = 426;
const DM_FACE_THRESHOLD = 0.4; // probs below this disappear
const DM_EYE_THRESHOLD = 0.4; // probs below which blink is masked
const DM_BLINK_THRESHOLD = 0.5; // probs above this count as blinking

// cache break index files
const STREAM_VERSION = 2;

const styles = (theme) => ({
  hidden: {
    display: 'none'
  },
  videoContainer: {
    position: 'relative',
    width: 850,
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
  thumbnail: {
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  }
});

function is_tici(init_data) {
  return init_data.InitData.DeviceType == 4;
}

class VideoPreview extends Component {
  constructor(props) {
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

    this.intrinsic = eon_intrinsic;
    this.vwp_w = eon_vwp_w;
    this.vwp_h = eon_vwp_h;
    this.video_height = eon_video_height;

    this.frame = 0;

    this.state = {
      bufferTime: 4,
      src: '',
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    this.mounted = true;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.rafLoop = raf(this.updatePreview);
    this.checkVideoBuffer();
    this.stopListening = TimelineWorker.onIndexed(() => this.checkDataBuffer());
  }

  componentDidUpdate(prevProps) {
    // play state
    this.checkVideoBuffer();
    this.updateVideoSource(prevProps);
  }

  componentWillUnmount() {
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

  updateVideoSource(prevProps) {
    const { props } = this;
    let segment = props.currentSegment;
    if (!segment && props.nextSegment) {
      const offset = TimelineWorker.currentOffset();
      if (props.nextSegment.startOffset - offset < 5000) {
        segment = props.nextSegment;
      }
    }
    if (!segment) {
      if (this.state.src !== '') {
        this.setState({ src: '' });
      }
      return;
    }

    if (props.front) {
      let base = `${process.env.REACT_APP_VIDEO_CDN}/hls/${props.dongleId}/${segment.url.split('/').pop()}`;
      base += '/dcamera';
      // We append count of segments with stream available as a cache-busting method
      // on stream indexes served before route is fully uploaded
      let segCount = segment.driverCameraStreamSegCount;
      let src = `${base}/index.m3u8?v=${STREAM_VERSION}&s=${segCount}`;
      if (this.state.src !== src) {
        this.setState({ src });
      }
    } else if (this.state.src === '' || !prevProps.currentSegment || prevProps.currentSegment.route !== segment.route) {
      let videoApi = VideoApi(segment.url, process.env.REACT_APP_VIDEO_CDN);
      videoApi.getQcameraStreamIndex().then(() => {
        let src = videoApi.getQcameraStreamIndexUrl() + `?s=${segment.cameraStreamSegCount}`
        if (src !== this.state.src) {
          this.setState({src});
        }
      }).catch(() => {
        let src = videoApi.getRearCameraStreamIndexUrl() + `?s=${segment.cameraStreamSegCount}`;
        if (src !== this.state.src) {
          this.setState({src});
        }
      });
    }
  }

  onSourceLoaded() {
    if (this.videoPlayer.current) {
      console.log('Calling load with media change');
      this.videoPlayer.current.load();
    }
  }

  onDisableBuffering() {
    TimelineWorker.disableBuffer();
  }

  updatePreview() {
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
    let isDataBuffering = true;
    if (this.props.currentSegment) {
      const monoTime = TimelineWorker.currentLogMonoTime();
      const monoTimeLength = (`${monoTime}`).length;
      const logIndex = TimelineWorker.getLogIndex();
      if (logIndex) {
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
      }
    } else {
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
    const videoPlayer = this.videoPlayer.current;
    const { front } = this.props;

    if (videoPlayer && !videoPlayer.wasConnected) {
      videoPlayer.wasConnected = true;
      if (this.stopListeningToVideo) {
        this.stopListeningToVideo();
        this.stopListeningToVideo = null;
      }
      this.stopListeningToVideo = videoPlayer.subscribeToStateChange(this.checkVideoBuffer);
    }

    const offset = TimelineWorker.currentOffset();
    let shouldShowPreview = true;
    const { bufferTime } = this.state;
    const { playSpeed } = this.props;
    let { desiredPlaySpeed } = this.props;

    if (videoPlayer) {
      const playerState = videoPlayer.getState().player;
      if (!playerState.buffered || Number.isNaN(playerState.duration)) {
        return;
      }
      let desiredVideoTime = this.currentVideoTime(offset);
      const curVideoTime = playerState.currentTime;
      if (desiredPlaySpeed && this.props.currentSegment) {
        const timeDiff = desiredVideoTime - curVideoTime;

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
          if (start < 6 && desiredVideoTime < 6) {
            start = desiredVideoTime;
            desiredBufferedVideoTime = desiredVideoTime;
          }
          if (start > desiredVideoTime && start - desiredVideoTime < 0.5) {
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

        if (desiredVideoTime > 5 && (playerState.waiting || playerState.seeking)) {
          isBuffering = true;
        }

        const timeDiffAbs = Math.abs(timeDiff);
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
            desiredPlaySpeed += timeDiff;
          // } else {
          }
        }

        if (isBuffering && !front) {
          isBuffering = this.updatePreviewImage(playerState.seeking ? null : timeDiff);
        } else if (this.state.shouldShowThumbnail) {
          this.setState({
            shouldShowThumbnail: false
          });
        }

        if (this.props.bufferingVideo !== isBuffering) {
          // console.log('Changing video buffer state to', isBuffering);
          TimelineWorker.bufferVideo(isBuffering);
        }

        shouldShowPreview = isBuffering;

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
        if (this.props.currentSegment) {
          if (front || this.updatePreviewImage()) {
            // no image
            if (Math.abs(curVideoTime - desiredVideoTime) > 1) {
              videoPlayer.seek(desiredVideoTime);
            }
          }
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
  }, 100)

  updatePreviewImage(timeDiff) {
    const { shouldShowThumbnail } = this.state;
    const thumbnail = TimelineWorker.currentThumbnail();
    const monoTime = TimelineWorker.currentLogMonoTime();
    const monoTimeLength = (`${monoTime}`).length;
    let retVal = true;
    if (thumbnail) {
      const { thumbnailMonoTime } = this.state;
      const thumbnailTime = Number(thumbnail.LogMonoTime.substr(0, monoTimeLength));
      const thumbnailTimeDiff = thumbnailTime;

      if (Number.isFinite(timeDiff) && timeDiff > 0 && timeDiff < thumbnailTimeDiff) {
        retVal = false;
        // the video is closer than we are
      } else if (thumbnailMonoTime !== thumbnail.LogMonoTime || !shouldShowThumbnail) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(thumbnail.Thumbnail.Thumbnail)));
        this.setState({
          thumbnailData: base64,
          thumbnailMonoTime: thumbnail.LogMonoTime,
          shouldShowThumbnail: true
        });
      }
      retVal = false;
    } else if (shouldShowThumbnail) {
      this.setState({
        shouldShowThumbnail: false
      });
    }

    return retVal;
  }

  renderCanvas() {
    const calibration = TimelineWorker.getCalibration(this.props.route);
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
          this.canvas_face.current, params, events, this.renderDriverMonitoring
        );
      }
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
        this.video_height = tici_video_height;
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
    // reset transform before anything, just in case
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // clear all the data
    ctx.clearRect(0, 0, width, height);
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
    const isMetric = metricParam.Value === '1';
    if (isMetric) {
      speed = Math.floor(speed * 3.6 + 0.5);
    } else {
      speed = Math.floor(speed * 2.2369363 + 0.5);
    }

    const x = this.vwp_w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 128px Open Sans';
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillText(speed, x, 140);

    ctx.font = '400 48px Open Sans';
    ctx.fillStyle = 'rgba(255,255,255,200)';
    if (isMetric) {
      ctx.fillText('kph', x, 210);
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
    if (metricParam.Value === '1') {
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
    ctx.font = `${26 * (4 / 3)}px Open Sans`;
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
      ctx.font = `700 ${48 * (4 / 3)}px Open Sans`;
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.fillText(Math.floor(maxSpeedCalc), 2 + left + width / 2, textBottomY);
    } else {
      ctx.font = `600 ${42 * (4 / 3)}px Open Sans`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.392)';
      ctx.fillText('N/A', left + width / 2, textBottomY);
    }

    if (ControlsState.DecelForTurnDEPRECATED && ControlsState.Enabled) {
      const turnSpeed = ControlsState.VCurvatureDEPRECATED * 2.2369363 + 0.5;
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.font = `700 ${25 * (4 / 3)}px Open Sans`;
      ctx.fillText('TURN', 200 * (2 / 3) + left + width / 2, textTopY);
      ctx.font = `700 ${50 * (4 / 3)}px Open Sans`;
      ctx.fillText(Math.floor(turnSpeed), 200 * (2 / 3) + left + width / 2, textBottomY);
    }
  }

  drawCarStateWheel(options, CarState, ControlsState) {
    const { ctx } = options;

    const radius = 80;
    const x = this.vwp_w - (radius + (bdr_s * 2));
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
    ctx.rotate(0 - CarState.SteeringAngle * Math.PI / 180);
    ctx.save();
    ctx.translate(-x, -y);

    // Wheel Image
    ctx.beginPath();
    ctx.arc(x, y, radius - (bdr_s / 2), 0, 2 * Math.PI, false);
    const wheelImgPattern = ctx.createPattern(wheelImg, 'repeat');
    ctx.fillStyle = wheelImgPattern;
    ctx.closePath();
    ctx.translate(this.vwp_w - ((bdr_s * 2) + bdr_s / 2), (bdr_s * 2) + bdr_s / 2);
    ctx.fill();
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

  renderDriverMonitoring(options, events) {
    if (!events.driverMonitoring) {
      return;
    }

    const { ctx } = options;
    const driverMonitoring = events.driverMonitoring.DriverMonitoring;

    if (driverMonitoring.FaceProb < 0.8) {
      return;
    }

    const xW = this.vwp_h / 2;
    const xOffset = this.vwp_w - xW;
    let noseSize = 20;
    ctx.translate(xOffset, 0);

    const isDistracted = this.isDistracted(driverMonitoring);

    const opacity = (driverMonitoring.FaceProb - DM_FACE_THRESHOLD) / (1 - DM_FACE_THRESHOLD) * 255;
    noseSize *= 1 / (driverMonitoring.FaceProb);
    let [x, y] = driverMonitoring.FacePosition.map((v) => v + 0.5);
    x = toX(x);
    y = toY(y);

    const flatMatrix = this.rot_matrix(...driverMonitoring.FaceOrientation)
      .reduce((m, v) => m.concat([...v, 1]), [])
      .concat([0, 0, 0, 1]);
    flatMatrix[3] = x;
    flatMatrix[7] = y;

    const p1 = this.matmul(flatMatrix, [0, 0, 0, 1]);
    const p2 = this.matmul(flatMatrix, [0, 0, 100, 1]);

    let isBlinking = false;

    if (
      driverMonitoring.LeftBlinkProb + driverMonitoring.RightBlinkProb > 2 * DM_BLINK_THRESHOLD
      && driverMonitoring.LeftEyeProb > DM_EYE_THRESHOLD
      && driverMonitoring.RightEyeProb > DM_EYE_THRESHOLD
    ) {
      isBlinking = true;
    }

    ctx.lineWidth = 3;
    ctx.beginPath();
    if (isDistracted) {
      ctx.strokeStyle = `rgba(255, 0, 0, ${opacity})`;
    } else if (isBlinking) {
      ctx.strokeStyle = `rgba(255, 255, 0, ${opacity})`;
    } else {
      ctx.strokeStyle = `rgba(0, 255, 0, ${opacity})`;
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
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineTo((p2[0]), (p2[1]));
    ctx.stroke();
    ctx.closePath();

    function toX(x) {
      return (x * xW);
    }
    function toY(y) {
      return (y * this.vwp_h);
    }
  }

  isDistracted(driverMonitoring) {
    const pose = this.getDriverPose(driverMonitoring);

    let pitch_error = pose.pitch - _PITCH_NATURAL_OFFSET;
    const yaw_error = pose.yaw - _YAW_NATURAL_OFFSET;
    if (pitch_error > 0) {
      pitch_error = Math.max(pitch_error - _PITCH_POS_ALLOWANCE, 0);
    }

    pitch_error *= _PITCH_WEIGHT;
    const pose_metric = Math.sqrt(Math.pow(yaw_error, 2) + Math.pow(pitch_error, 2));
    if (pose_metric > _METRIC_THRESHOLD) {
      return true;
    }
    return false;
  }

  getDriverPose(driverMonitoring) {
    // use driver monitoring units instead of canvas units
    // that way code can be nearly identical
    const angles_desc = driverMonitoring.FaceOrientation;
    const pos_desc = driverMonitoring.FacePosition;

    const pitch_net = angles_desc[0];
    const yaw_net = angles_desc[1];
    const roll_net = angles_desc[2];

    const face_pixel_position = [(pos_desc[0] + 0.5) * W - W + FULL_W, (pos_desc[1] + 0.5) * H];
    const yaw_focal_angle = Math.atan2(face_pixel_position[0] - FULL_W / 2, RESIZED_FOCAL);
    const pitch_focal_angle = Math.atan2(face_pixel_position[1] - H / 2, RESIZED_FOCAL);

    const roll = roll_net;
    const pitch = pitch_net + pitch_focal_angle;
    const yaw = -yaw_net + yaw_focal_angle;
    return { roll, pitch, yaw };
  }

  carSpaceToImageSpace(coords) {
    coords = this.matmul(this.extrinsic, coords);
    coords = this.matmul(this.intrinsic, coords);

    // project onto 3d with Z
    coords[0] /= coords[2];
    coords[1] /= coords[2];
    return coords;
  }

  rot_matrix(roll, pitch, yaw) {
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);

    const rr = [
      [1, 0, 0],
      [0, cr, -sr],
      [0, sr, cr]
    ];
    const rp = [
      [cp, 0, sp],
      [0, 1, 0],
      [-sp, 0, cp]
    ];
    const ry = [
      [cy, -sy, 0],
      [sy, cy, 0],
      [0, 0, 1]
    ];
    return multiply(ry, multiply(rp, rr));
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
    if (!this.props.currentSegment) {
      return 0;
    }
    offset -= this.props.currentSegment.routeOffset;
    offset = offset / 1000;

    if (!this.props.front) {
      let initData = TimelineWorker.currentInitData();
      let firstFrameTime = TimelineWorker.firstFrameTime();

      if (initData !== null && firstFrameTime !== null) {
        offset -= (firstFrameTime - initData.LogMonoTime/1e9);
      }
    }

    return offset;
  }

  // nearest cache-worthy frame of the video
  // always show a frame before the current offset so that data is what happened
  // after this frame was seen, that way you can't see things it hasn't reacted to
  nearestImageFrame(offset = TimelineWorker.currentOffset()) {
    const segment = this.props.currentSegment || this.props.nextSegment;
    if (!segment) {
      return '';
    }
    offset -= segment.routeOffset;
    const seconds = Math.max(1, Math.floor(offset / 1000) * 1);

    return `${segment.url}/sec${seconds}.jpg`;
  }

  render() {
    const { classes } = this.props;
    if (this.props.playSpeed !== this.props.desiredPlaySpeed && !this.props.isBuffering) {
      console.log(this.props);
      debugger;
    }
    return (
      <div
        className={classNames(classes.videoContainer, {
          [classes.hidden]: false
        })}
      >
        { this.props.isBuffering
          && (
          <Buffering
            bufferingVideo={this.props.bufferingVideo}
            bufferingData={this.props.bufferingData}
            onDisableBuffering={this.onDisableBuffering}
          />
          )}
        { this.state.shouldShowThumbnail
          && (
          <img
            style={{ zIndex: 2 }}
            className={this.props.classes.thumbnail}
            src={`data:image/jpeg;base64,${this.state.thumbnailData}`}
          />
          )}
        <Player
          ref={this.videoPlayer}
          style={{ zIndex: 1 }}
          autoPlay={!!this.props.currentSegment}
          muted
          fluid={false}
          src={this.state.src}
          startTime={this.currentVideoTime()}
          playbackRate={this.props.startTime > Date.now() ? 0 : this.props.playSpeed}
          width={850}
          height={this.video_height}
        >
          <HLSSource
            onBufferAppend={this.checkVideoBuffer}
            onSourceLoaded={this.onSourceLoaded}
            isVideoChild
          />
          <ControlBar disabled disableCompletely />
        </Player>
        { this.props.shouldShowUI
          && (
            <>
              <canvas
                ref={this.canvas_road}
                className={classNames(classes.videoUiCanvas, 'hudRoadCanvas')}
                style={{ zIndex: 3 }}
              />
              <canvas
                ref={this.canvas_lead}
                className={classes.videoUiCanvas}
                style={{ zIndex: 4 }}
              />
              <canvas
                ref={this.canvas_carstate}
                className={classes.videoUiCanvas}
                style={{ zIndex: 5 }}
              />
              <canvas
                ref={this.canvas_maxspeed}
                className={classes.videoUiCanvas}
                style={{ zIndex: 6 }}
              />
              <canvas
                ref={this.canvas_speed}
                className={classes.videoUiCanvas}
                style={{ zIndex: 7 }}
              />
            </>
          )}
        { this.props.front
          && (
            <>
              <canvas
                ref={this.canvas_face}
                className={classes.videoUiCanvas}
                style={{ zIndex: 3 }}
              />
            </>
          )}
      </div>
    );
  }
}

VideoPreview.propTypes = {
  playSpeed: PropTypes.number.isRequired
};

function mapStateToProps(state) {
  return state.workerState;
}

export default connect(mapStateToProps)(withStyles(styles)(VideoPreview));
