/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import debounce from 'debounce';
import Obstruction from 'obstruction';
import ReactPlayer from 'react-player/file';

import { video as Video } from '@commaai/api';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, bufferVideo, selectLoop } from '../../timeline/playback';
import { isIos } from '../../utils/browser.js';

const VideoOverlay = ({ loading, error }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onVideoBuffering = this.onVideoBuffering.bind(this);
    this.onVideoBufferEnd = this.onVideoBufferEnd.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onVideoResume = this.onVideoResume.bind(this);
    this.onVideoDuration = this.onVideoDuration.bind(this);
    this.syncVideo = debounce(this.syncVideo.bind(this), 200, true);
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

  onVideoBuffering() {
    const { dispatch } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (this.firstSeek && videoPlayer) {
      this.firstSeek = false;
      videoPlayer.seekTo(this.currentVideoTime(), 'seconds');
    }
    dispatch(bufferVideo(true));
  }

  onVideoBufferEnd() {
    const { dispatch, isBufferingVideo } = this.props;
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
    if (isBufferingVideo) dispatch(bufferVideo(false));
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // buffer but no error
      return;
    }

    if (e.type === 'networkError' && (e.response?.code === 404)) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
  }

  /**
   * @param {Error} e
   * @param {any} [data]
   */
  onVideoError(e, data) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }

    if (e.name === 'AbortError') {
      // ignore
      return;
    }

    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // TODO: figure out why the src isn't set properly
      // Sometimes an error will be thrown because we try to play
      // src: "https://connect.comma.ai/.../undefined"
      console.warn('Video error with undefined src, ignoring', { e, data });
      return;
    }

    const { dispatch } = this.props;
    dispatch(bufferVideo(true));

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
      return;
    }

    const videoError = e.response?.code === 404
      ? 'This video segment has not uploaded yet or has been deleted.'
      : (e.response?.text || 'Unable to load video');
    this.setState({ videoError });
  }

  onVideoResume() {
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
  }

  /**
   * @param {number} duration video duration in seconds
   */
  onVideoDuration(duration) {
    const { currentRoute, loop, dispatch } = this.props;
    if (!currentRoute || !loop || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    // route.duration (wall-clock) often disagrees with HLS duration: last segment is
    // a partial chunk because the user can turn the car off mid-segment, sometimes
    // the camera stops a fraction before the logger does, etc. Shrink the loop end
    // to match what the video can actually play so the loop wraps cleanly.
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    const videoEndMs = videoStartOffset + (duration * 1000);
    const loopEnd = loop.startTime + loop.duration;
    if (loopEnd > videoEndMs + 100) {
      dispatch(selectLoop(loop.startTime, videoEndMs));
    }
  }

  updateVideoSource(prevProps) {
    let { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      src = Video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
      this.setState({ src, videoError: null });
      this.syncVideo();
    }
  }

  syncVideo() {
    const { dispatch, isBufferingVideo, desiredPlaySpeed, currentRoute } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (!videoPlayer || !videoPlayer.getInternalPlayer() || !videoPlayer.getDuration()) {
      return;
    }

    const internalPlayer = videoPlayer.getInternalPlayer();
    const duration = videoPlayer.getDuration();
    const desiredVideoTime = this.currentVideoTime();
    const curVideoTime = videoPlayer.getCurrentTime();
    const timeDiff = desiredVideoTime - curVideoTime;
    const videoStartOffset = currentRoute?.videoStartOffset || 0;
    const videoAtEnd = internalPlayer.ended || curVideoTime >= duration - 0.1;

    // HTML5 spec: play() on an ended media element auto-seeks to 0.
    // If the loop extends past the video (e.g., currentRoute.duration > video.duration
    // because the route is still uploading), our auto-resume play() rewinds to 0 just
    // for the next tick to push back past the end and clamp — a 1 fps stutter loop.
    // Force the timeline wrap ourselves so the next push goes to the loop start cleanly.
    if (internalPlayer.ended && desiredPlaySpeed > 0 && desiredVideoTime >= duration - 0.5) {
      dispatch(seek(videoStartOffset));
      console.debug('[DriveVideo] sync', {
        cur: curVideoTime.toFixed(2),
        desired: desiredVideoTime.toFixed(2),
        duration: duration.toFixed(2),
        action: 'force-wrap-on-ended',
      });
      return;
    }

    let action = 'noop';
    if (Math.abs(timeDiff) > 0.5) {
      if (desiredVideoTime === 0 && timeDiff < 0 && curVideoTime !== duration) {
        // logs start earlier than the video, snap timeline forward to where video begins
        dispatch(seek(currentOffset() - (timeDiff * 1000)));
        action = 'snap-timeline-forward';
      } else {
        // user seek, loop wrap, or initial sync: push to video
        videoPlayer.seekTo(desiredVideoTime, 'seconds');
        action = 'push-video';
      }
    } else if (Math.abs(timeDiff) > 0.05 && desiredPlaySpeed > 0 && !isBufferingVideo && !videoAtEnd) {
      // let the video play freely and pull the timeline to match, instead of fudging the playback rate.
      // skip when the video is stuck at its end so the timeline can advance into the loop wrap.
      dispatch(seek(curVideoTime * 1000 + videoStartOffset));
      action = 'pull-timeline';
    }

    // ReactPlayer's `playing` prop only triggers play() on change, so it won't auto-resume
    // after the video element pauses itself at the end of a buffered range.
    let playResult = 'skip';
    if (desiredPlaySpeed > 0 && internalPlayer.paused && !internalPlayer.seeking) {
      playResult = 'called';
      const playRes = internalPlayer.play();
      if (playRes) {
        playRes
          .then(() => console.debug('[DriveVideo] play resolved'))
          .catch((err) => console.debug('[DriveVideo] play rejected:', err && err.message));
      }
    }

    console.debug('[DriveVideo] sync', {
      cur: curVideoTime.toFixed(2),
      desired: desiredVideoTime.toFixed(2),
      diff: timeDiff.toFixed(2),
      duration: duration.toFixed(2),
      paused: internalPlayer.paused,
      ended: internalPlayer.ended,
      seeking: internalPlayer.seeking,
      readyState: internalPlayer.readyState,
      buffering: isBufferingVideo,
      atEnd: videoAtEnd,
      action,
      play: playResult,
    });
  }

  currentVideoTime(offset = currentOffset()) {
    const { currentRoute } = this.props;
    if (!currentRoute) {
      return 0;
    }

    if (currentRoute.videoStartOffset) {
      offset -= currentRoute.videoStartOffset;
    }

    offset /= 1000;

    return Math.max(0, offset);
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, onAudioStatusChange, isMuted } = this.props;
    const { src, videoError } = this.state;

    const onPlayerReady = (player) => {
      if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
        const videoElement = player.getInternalPlayer();
        if (videoElement && videoElement.audioTracks && videoElement.audioTracks.length > 0) {
          if (onAudioStatusChange) {
            onAudioStatusChange(true);
          }
        }
      } else { // on other platforms, inspect audio tracks before hls.js changes things
        const hlsPlayer = player.getInternalPlayer('hls');
        if (hlsPlayer) {
          hlsPlayer.on('hlsBufferCodecs', (event, data) => {
            if (onAudioStatusChange) {
              onAudioStatusChange(!!data.audio);
            }
          });
        }
      }
    };

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          onReady={onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          playbackRate={desiredPlaySpeed}
          onBuffer={this.onVideoBuffering}
          onBufferEnd={this.onVideoBufferEnd}
          onPlay={this.onVideoResume}
          onDuration={this.onVideoDuration}
          onError={this.onVideoError}
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
  loop: 'loop',
});

export default connect(stateToProps)(DriveVideo);
