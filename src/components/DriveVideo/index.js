/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography, withStyles } from '@material-ui/core';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import debounce from 'debounce';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player';

import { video as Video } from '@commaai/api';

import Colors from '../../colors';
import { seek, bufferVideo, currentOffset } from '../../timeline/playback';
import { updateSegments } from '../../timeline/segments';

const styles = () => ({
  hidden: {
    display: 'none',
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
    zIndex: 1,
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

    this.visibleRoute = this.visibleRoute.bind(this);
    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.syncVideo = debounce(this.syncVideo.bind(this), 200);
    this.firstSeek = true;

    this.videoPlayer = React.createRef();

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    const { playSpeed } = this.props;
    if (this.videoPlayer.current) {
      this.videoPlayer.current.playbackRate = playSpeed || 1;
    }
    this.updateVideoSource({});
    this.syncVideo();
    this.videoSyncIntv = setInterval(this.syncVideo, 500);
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

  visibleRoute(props = this.props) {
    const offset = currentOffset();
    const { currentRoute } = props;
    if (currentRoute && currentRoute.offset <= offset && offset <= currentRoute.offset + currentRoute.duration) {
      return currentRoute;
    }
    return null;
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const r = this.visibleRoute();
    if (!r) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    const prevR = this.visibleRoute(prevProps);
    if (src === '' || !prevR || prevR.fullname !== r.fullname) {
      src = Video.getQcameraStreamUrl(r.fullname, r.share_exp, r.share_sig);
      this.setState({ src, videoError: null });
      this.syncVideo();
    }
  }

  onVideoBuffering() {
    const { dispatch } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !this.visibleRoute() || !videoPlayer.getDuration()) {
      dispatch(bufferVideo(true));
    }

    if (this.firstSeek) {
      this.firstSeek = false;
      videoPlayer.seekTo(this.currentVideoTime(), 'seconds');
    }

    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() > 30;
    if (!hasSufficientBuffer || videoPlayer.getInternalPlayer().readyState < 2) {
      dispatch(bufferVideo(true));
    }
  }

  onVideoError(msg, e) {
    if (msg?.target?.src?.startsWith(window.location.origin) && msg?.target?.src?.endsWith('undefined')) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn('Video error with undefined src, ignoring', { msg, e });
      return;
    }

    const { dispatch } = this.props;
    dispatch(bufferVideo(false));
    if (!e || !e.response) {
      console.error('Unknown video error', { msg, e });
      this.setState({ videoError: 'Unable to load video' });
      return;
    }

    let videoError = e.response.text;
    if (e.response.code === 404) {
      videoError = 'This video segment has not uploaded yet or has been deleted.';
    }
    this.setState({ videoError });
  }

  onVideoResume() {
    const { dispatch } = this.props;
    dispatch(bufferVideo(false));
    this.setState({ videoError: null });
  }

  syncVideo() {
    const { dispatch, isBufferingVideo, routes } = this.props;
    if (!this.visibleRoute()) {
      dispatch(updateSegments());
      if (routes && isBufferingVideo) {
        dispatch(bufferVideo(false));
      }
      return;
    }

    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const internalPlayer = videoPlayer.getInternalPlayer();

    // sanity check required for ios
    const sufficientBuffer = Math.min(videoPlayer.getDuration() - videoPlayer.getCurrentTime(), 30);
    const hasSufficientBuffer = videoPlayer.getSecondsLoaded() - videoPlayer.getCurrentTime() >= sufficientBuffer;
    if (hasSufficientBuffer && internalPlayer.readyState >= 2 && isBufferingVideo) {
      dispatch(bufferVideo(false));
    }

    let { desiredPlaySpeed: newPlaybackRate } = this.props;
    const desiredVideoTime = this.currentVideoTime();
    const curVideoTime = videoPlayer.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;
    if (Math.abs(timeDiff) <= 0.3) {
      newPlaybackRate = Math.max(0, newPlaybackRate + timeDiff);
    } else if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== videoPlayer.getDuration()) {
      // logs start earlier than video, so skip to video ts 0
      dispatch(seek(currentOffset() - (timeDiff * 1000)));
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
    const visibleRoute = this.visibleRoute();
    if (!visibleRoute) {
      return 0;
    }
    offset -= visibleRoute.offset;

    if (visibleRoute.videoStartOffset) {
      offset -= visibleRoute.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  render() {
    const { classes, desiredPlaySpeed: playSpeed, dispatch, isBufferingVideo } = this.props;
    const { src, videoError } = this.state;
    return (
      <div className={ classes.videoContainer }>
        {(isBufferingVideo || videoError)
          && (
            <div className={classes.bufferingContainer}>
              <div className={classes.bufferingSpinner}>
                {isBufferingVideo
                  ? <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />
                  : (
                    <>
                      <ErrorOutlineIcon />
                      <Typography>{videoError}</Typography>
                    </>
                  )}
              </div>
            </div>
          )}
        <ReactPlayer
          ref={ this.videoPlayer }
          url={ src }
          playsinline
          muted
          width="100%"
          height="unset"
          playing={ Boolean(this.visibleRoute()) && Boolean(playSpeed) }
          config={{ hlsOptions: { enableWorker: false, disablePtsDtsCorrectionInMp4Remux: false } }}
          playbackRate={ playSpeed }
          onBuffer={ this.onVideoBuffering }
          onBufferEnd={() => {
            dispatch(bufferVideo(false));
            this.onVideoResume();
          }}
          onStart={ this.onVideoResume }
          onPlay={ this.onVideoResume }
          onError={ this.onVideoError }
        />
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  desiredPlaySpeed: 'desiredPlaySpeed',
  offset: 'offset',
  startTime: 'startTime',
  isBufferingVideo: 'isBufferingVideo',
  routes: 'routes',
  currentRoute: 'currentRoute',
});

export default connect(stateToProps)(withStyles(styles)(DriveVideo));
