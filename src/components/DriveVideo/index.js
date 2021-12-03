/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { withStyles, Typography, CircularProgress } from '@material-ui/core';
import debounce from 'debounce';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player'
import Hls from '@commaai/hls.js';
import * as Sentry from '@sentry/react';

import { video as VideoApi } from '@commaai/comma-api';

import Colors from '../../colors';
import { seek, bufferVideo, currentOffset } from '../../timeline/playback';
import { updateSegments } from '../../timeline/segments';

window.Hls = Hls;

const styles = () => ({
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
  bufferingContainer: {
    zIndex: 50,
    position: 'absolute',
    height: '100%',
    width: '100%',
    backgroundColor: '#16181Aaa',
  },
  bufferingSpinner: {
    position: 'relative',
    textAlign: 'center',
    top: 'calc(50% - 25px)',
  },
});

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.visibleSegment = this.visibleSegment.bind(this);
    this.isVideoBuffering = this.isVideoBuffering.bind(this);
    this.syncVideo = debounce(this.syncVideo.bind(this), 500);

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.updateVideoSource({});
    this.syncVideo();
    this.videoSyncIntv = setInterval(this.syncVideo, 1000);
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
    this.syncVideo();
  }

  componentWillUnmount() {
    if (this.videoSyncIntv) {
      clearTimeout(this.videoSyncIntv);
      this.videoSyncIntv = null;
    }
  }

  visibleSegment(props = this.props) {
    const offset = currentOffset();
    const currSegment = props.currentSegment;
    if (currSegment && currSegment.routeOffset <= offset && offset <= currSegment.routeOffset + currSegment.duration) {
      return currSegment;
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
      let videoApi = VideoApi(segment.url, '');
      videoApi.getQcameraStreamIndex().then(() => {
        let src = videoApi.getQcameraStreamIndexUrl() + `?s=${segment.cameraStreamSegCount}`
        if (src !== this.state.src) {
          this.setState({src});
          this.syncVideo();
        }
      }).catch((err) => {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'drive_video_source_get_qcam_index' });
      });
    }
  }

  isVideoBuffering() {
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !this.visibleSegment() || !videoPlayer.getDuration()) {
      this.props.dispatch(bufferVideo(true));
    }

    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (!hasSufficientBuffer || videoPlayer.getInternalPlayer().readyState < 2) {
      this.props.dispatch(bufferVideo(true));
    }
  }

  syncVideo() {
    if (!this.visibleSegment()) {
      this.props.dispatch(updateSegments());
      return;
    }

    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const internalPlayer = videoPlayer.getInternalPlayer();

    // sanity check required for ios
    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (hasSufficientBuffer && internalPlayer.readyState >= 2 && this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(false));
    }

    let newPlaybackRate = this.props.desiredPlaySpeed;
    let desiredVideoTime = this.currentVideoTime();
    const curVideoTime = videoPlayer.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;
    if (Math.abs(timeDiff) <= 0.3) {
      newPlaybackRate = Math.max(0, newPlaybackRate + timeDiff)
    } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== videoPlayer.getDuration()) {
      // logs start ealier than video, so skip to video ts 0
      this.props.dispatch(seek(currentOffset() - (timeDiff * 1000)));
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
  }

  currentVideoTime(offset = currentOffset()) {
    const visibleSegment = this.visibleSegment();
    if (!visibleSegment) {
      return 0;
    }
    offset -= visibleSegment.routeOffset;
    offset -= visibleSegment.routeFirstSegment * 60000;
    offset = offset / 1000;

    return Math.max(0, offset);
  }

  render() {
    const { classes, isBufferingVideo } = this.props;
    const playSpeed = this.props.desiredPlaySpeed;
    return (
      <div className={ classes.videoContainer }>
        { isBufferingVideo &&
          <div className={ classes.bufferingContainer }>
            <div className={ classes.bufferingSpinner }>
              <CircularProgress style={{ color: Colors.white }} thickness={ 4 } size={ 50 } />
            </div>
          </div>
        }
        <ReactPlayer ref={ this.videoPlayer } url={ this.state.src } playsinline={ true } muted={ true }
          width="100%" height="unset" playing={ Boolean(this.visibleSegment()) && Boolean(playSpeed) }
          config={{ hlsOptions: { enableWorker: false, disablePtsDtsCorrectionInMp4Remux: false } }}
          playbackRate={ playSpeed }
          onBuffer={ () => this.isVideoBuffering() }
          onBufferEnd={ () => this.props.dispatch(bufferVideo(false)) }
          onPlay={ () => this.props.dispatch(bufferVideo(false)) } />
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  currentSegment: 'currentSegment',
  desiredPlaySpeed: 'desiredPlaySpeed',
  offset: 'offset',
  startTime: 'startTime',
  isBufferingVideo: 'isBufferingVideo',
});

export default connect(stateToProps)(withStyles(styles)(DriveVideo));
