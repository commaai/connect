/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
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
    this.canvas_carstate = React.createRef();

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
      const playRes = internalPlayer.play();
      if (playRes) {
        playRes.catch(() => console.log('play interrupted by pause'));
      }
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

  renderCarState(options, events) {
    if (events && events.carState && events.controlsState) {
      this.drawCarStateBorder(options, events.controlsState.ControlsState);
    }
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
      <div className={ classes.videoContainer }>
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
          <canvas className={classes.videoUiCanvas} style={{ zIndex: 5 }} ref={this.canvas_carstate} />
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
