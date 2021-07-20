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
import Buffering from './buffering';

window.Hls = Hls;

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
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
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
  }

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

    let newPlaybackRate = this.props.desiredPlaySpeed;
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
    const { classes, isBufferingVideo } = this.props;
    const playSpeed = this.props.desiredPlaySpeed;
    return (
      <div className={ classes.videoContainer }>
        { isBufferingVideo &&
          <Buffering isBufferingVideo={ isBufferingVideo } />
        }
        <ReactPlayer ref={ this.videoPlayer } url={ this.state.src } playsinline={ true } muted={ true }
          width="100%" height="unset" playing={ Boolean(this.visibleSegment()) && Boolean(playSpeed) }
          config={{ hlsOptions: { enableWorker: false, disablePtsDtsCorrectionInMp4Remux: false } }}
          playbackRate={ playSpeed }
          onBuffer={ () => TimelineWorker.bufferVideo(true) }
          onBufferEnd={ () => TimelineWorker.bufferVideo(false) }
          onPlay={ () => TimelineWorker.bufferVideo(false) } />
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
});

export default connect(stateToProps)(withStyles(styles)(DriveVideo));
