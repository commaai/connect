import React, { Component } from 'react';
import { connect } from 'react-redux'
import { withStyles } from '@material-ui/core/styles';
import raf from 'raf';
import classNames from '@sindresorhus/class-names';
import * as tfc from '@tensorflow/tfjs-core';

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
      border: '2px solid blue',
      margin: -2
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

    this.renderUI();

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
  renderUI () {
    if (!this.imageRef.current || !this.canvas.current) {
      return;
    }
    if (this.imageRef.current.height === 0) {
      return;
    }
    var ctx = this.canvas.current.getContext('2d');
    var width = this.imageRef.current.width;
    var height = this.imageRef.current.height;
    this.canvas.current.width = width;
    this.canvas.current.height = height;

    ctx.clearRect(0, 0, width, height);

    var calibration = TimelineWorker.getCalibration(this.props.route);
    if (!calibration) {
      return; // loading calibration from logs still...
    }
    let model = TimelineWorker.currentModel();
    if (!model) {
      return; // we're calibrated but not model frames yet
    }
    var intrinsic = intrinsicMatrix();
    var extrinsic = tfc.tensor([...calibration.LiveCalibration.ExtrinsicMatrix, 0, 0, 0, 1], [4, 4]);
    var warpMatrix = tfc.tensor(calibration.LiveCalibration.WarpMatrix2, [3, 3]);

    // reset transform before anything
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // scale original coords onto our current size
    ctx.scale(width / 1440, height / 1080);
    // offset for the implicit UI adding video margin
    ctx.translate(120, 80);

    ctx.lineWidth = 5;

    ctx.strokeStyle = 'purple';
    this.drawLaneLine({
      ctx,
      calibration,
      intrinsic,
      extrinsic,
      points: model.Model.LeftLane.Points,
      std: 0.025 * model.Model.LeftLane.Prob,
      // std: model.Model.RightLane.Std
    });
    ctx.strokeStyle = 'green';
    this.drawLaneLine({
      ctx,
      calibration,
      intrinsic,
      extrinsic,
      points: model.Model.RightLane.Points,
      std: 0.025 * model.Model.RightLane.Prob,
      // std: 0 - model.Model.RightLane.Std
    });
    // reset back to normal
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 8;
    this.drawLaneLine({
      ctx,
      calibration,
      intrinsic,
      extrinsic,
      points: model.Model.LeftLane.Points,
      // std: 0.025 * model.Model.LeftLane.Prob,
      std: 0 - model.Model.LeftLane.Std
    });
    this.drawLaneLine({
      ctx,
      calibration,
      intrinsic,
      extrinsic,
      points: model.Model.LeftLane.Points,
      // std: 0.025 * model.Model.LeftLane.Prob,
      std: model.Model.LeftLane.Std
    });
    this.drawLaneLine({
      ctx,
      calibration,
      intrinsic,
      extrinsic,
      points: model.Model.RightLane.Points,
      // std: 0.025 * model.Model.LeftLane.Prob,
      std: 0 - model.Model.RightLane.Std
    });
    this.drawLaneLine({
      ctx,
      calibration,
      intrinsic,
      extrinsic,
      points: model.Model.RightLane.Points,
      // std: 0.025 * model.Model.LeftLane.Prob,
      std: model.Model.RightLane.Std
    });
  }
  drawLaneLine (options) {
    const {
      ctx,
      points,
      std,
      calibration,
      intrinsic,
      extrinsic
    } = options;
    /*

const int vwp_w = 1920;
const int vwp_h = 1080;
const int nav_w = 640;
const int nav_ww= 760;
const int sbr_w = 300;
const int bdr_s = 30;
const int box_x = sbr_w+bdr_s;
const int box_y = bdr_s;
const int box_w = vwp_w-sbr_w-(bdr_s*2);
const int box_h = vwp_h-(bdr_s*2);
const int viz_w = vwp_w-(bdr_s*2);
const int header_h = 420;

nvgTranslate(s->vg, 240.0f, 0.0); // rgb-box space
nvgTranslate(s->vg, -1440.0f / 2, -1080.0f / 2); // zoom 2x
nvgScale(s->vg, 2.0, 2.0);
nvgScale(s->vg, 1440.0f / s->rgb_width, 1080.0f / s->rgb_height);
    */

    const { width, height } = this.imageRef.current;

    ctx.beginPath();
    var isFirst = true;
    points.forEach(function (val, i) {
      var y = val - std;
      var x = i;

      var pCarSpace = tfc.tensor([x, y, 0, 1], [4, 1]);
      // pCarSpace.print();
      var ep4 = tfc.matMul(extrinsic, pCarSpace).dataSync();
      const ep = tfc.tensor([ep4[0], ep4[1], ep4[2]], [3, 1]);
      // ep.print();
      var kep = tfc.matMul(intrinsic, ep);
      // const vec3 p_image = {{KEp.v[0] / KEp.v[2], KEp.v[1] / KEp.v[2], 1.}};

      var finalPoint = [
        kep.get(0, 0) / kep.get(0, 2),
        kep.get(0, 1) / kep.get(0, 2),
        1
      ];
      if (finalPoint[0] < 0 && finalPoint[1] < 0) {
        return;
      }
      // finalPoint[0] += 120;
      // console.log(finalPoint);
      if (isFirst) {
        isFirst = false;
        ctx.moveTo(finalPoint[0], finalPoint[1]);
      } else {
        ctx.lineTo(finalPoint[0], finalPoint[1]);
      }
    });
    ctx.stroke();
    // extrinsic.print();
    // calibration.LiveCalibration.ExtrinsicMatrix
    // calibration.LiveCalibration.WarpMatrix2
    // debugger;
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
          <canvas ref={ this.canvas } className={ this.props.classes.canvas } style={{
            zIndex: 2
          }} />
        </div>
      </div>
    );
  }
}

function intrinsicMatrix () {
  return tfc.tensor([
    950.892854,   0,        584,
    0,          950.892854, 439,
    0,            0,        1
  ], [3, 3]);
}

function mapStateToProps(state) {
  return state.workerState;
}

export default connect(mapStateToProps)(withStyles(styles)(VideoPreview));
