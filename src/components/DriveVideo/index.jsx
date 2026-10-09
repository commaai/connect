/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { popTimelineRange } from '../../actions';
import { seek, bufferVideo, pause, play } from '../../timeline/playback';
import {
  attachVideo, detachVideo, isActiveVideo, isPartialRange, isStalled, playbackRange, seekVideo,
} from '../../timeline/video';
import { isIos, isFirefox } from '../../utils/browser.js';

// native media events after which the video may have started or stopped waiting for data.
// timeupdate fires several times a second while playing, so a wrong state never lasts.
const BUFFERING_EVENTS = [
  'loadstart', 'emptied', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
  'waiting', 'playing', 'seeking', 'seeked', 'timeupdate', 'play', 'pause',
];

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

    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.updateBuffering = this.updateBuffering.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.checkRangeEnd = this.checkRangeEnd.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onVideoError = this.onVideoError.bind(this);

    this.video = null;
    this.videoFailed = false; // the video can't play, the playback clock keeps time instead
    this.frame = null;
    this.leftZoom = null; // range we already left, until props catch up
    this.buffering = null; // last buffering state sent to redux
    this.playSpeed = 1; // last speed the user played at
    this.playbackRate = 1;

    this.state = {
      src: null,
      videoError: null,
    };
  }

  componentDidMount() {
    this.updateVideoSource({});
    this.frame = requestAnimationFrame(this.checkRangeEnd);
  }

  componentDidUpdate(prevProps) {
    this.updateVideoSource(prevProps);
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frame);
    // hand the position over to the playback clock, which keeps time without a video
    const offset = currentOffset();
    this.setVideoElement(null);
    this.props.dispatch(seek(offset));
  }

  onPlayerReady(player) {
    this.setVideoElement(player.getInternalPlayer());

    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) {
      return;
    }
    if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
      const videoElement = player.getInternalPlayer();
      if (videoElement && videoElement.audioTracks && videoElement.audioTracks.length > 0) {
        onAudioStatusChange(true);
      }
    } else { // on other platforms, inspect audio tracks before hls.js changes things
      const hlsPlayer = player.getInternalPlayer('hls');
      if (hlsPlayer) {
        hlsPlayer.on('hlsBufferCodecs', (event, data) => {
          onAudioStatusChange(!!data.audio);
        });
      }
    }
  }

  // once the video knows its duration it takes over keeping time, starting where the playback clock is
  onLoadedMetadata() {
    const { currentRoute } = this.props;
    if (!currentRoute || !this.video) {
      return;
    }
    this.videoFailed = false;
    const offset = currentOffset();
    attachVideo(this.video, currentRoute.fullname);
    seekVideo(currentRoute, offset);
  }

  // The video can't play: let the playback clock keep time from here,
  // so the map and timeline still replay the drive.
  handOverToClock() {
    if (this.videoFailed) {
      return;
    }
    const offset = currentOffset();
    this.videoFailed = true;
    detachVideo(this.video);
    this.props.dispatch(seek(offset));
    this.updateBuffering();
  }

  // play and pause can also come from outside the page controls,
  // like the picture-in-picture window or media keys, so mirror them into redux
  onPlay() {
    const { currentRoute, desiredPlaySpeed, dispatch } = this.props;
    if (desiredPlaySpeed === 0 && isActiveVideo(this.video, currentRoute)) {
      dispatch(play(this.playSpeed));
    }
  }

  onPause() {
    const { currentRoute, desiredPlaySpeed, dispatch } = this.props;
    // reaching the end also pauses the video, onEnded decides what happens then
    if (desiredPlaySpeed > 0 && !this.video.ended && isActiveVideo(this.video, currentRoute)) {
      dispatch(pause());
    }
  }

  // the video can end before the range does when it is shorter than the logs
  onEnded() {
    if (isActiveVideo(this.video, this.props.currentRoute) && this.onRangeEnd()) {
      // ending paused the video
      this.video.play()?.catch(() => console.debug('[DriveVideo] play interrupted'));
    }
  }

  // checked every frame rather than on timeupdate, which only fires a few times a second
  checkRangeEnd() {
    const { currentRoute, desiredPlaySpeed, isBufferingVideo, loop, zoom } = this.props;
    const el = this.video;
    const playing = isActiveVideo(el, currentRoute)
      ? !el.paused && !el.seeking
      : desiredPlaySpeed > 0 && !isBufferingVideo;
    if (playing && zoom !== this.leftZoom) {
      const range = playbackRange(loop, zoom);
      if (range && currentOffset() >= range.end) {
        this.onRangeEnd();
      }
    }
    this.frame = requestAnimationFrame(this.checkRangeEnd);
  }

  // At the end of the range, repeat it. With looping off a selected range plays once, then returns
  // to where playback was before it was selected, or stops if there is nowhere to return to.
  // Returns whether playback continues.
  onRangeEnd() {
    const { currentRoute, desiredPlaySpeed, dispatch, rangeLooping, zoom } = this.props;
    if (rangeLooping || !isPartialRange(zoom, currentRoute)) {
      if (this.restartRange()) {
        return true;
      }
    } else if (zoom.previous) {
      this.leftZoom = zoom;
      dispatch(popTimelineRange(currentRoute.log_id));
      return true;
    }
    if (isActiveVideo(this.video, currentRoute)) {
      this.video.pause();
    }
    if (desiredPlaySpeed > 0) {
      dispatch(pause());
    }
    return false;
  }

  restartRange() {
    const { dispatch, loop, zoom } = this.props;
    const range = playbackRange(loop, zoom);
    if (!range) {
      return false;
    }
    dispatch(seek(range.start));
    return true;
  }

  onPlaying() {
    if (this.state.videoError) {
      this.setState({ videoError: null });
    }
  }

  /**
   * @param {Error} e
   */
  onHlsError(e) {
    if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // buffer but no error
      return;
    }

    if (e.type === 'networkError' && (e.response?.code === 404)) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
    // hls.js recovers from non fatal errors by itself
    if (e.fatal) {
      this.handOverToClock();
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

    if (e.type === 'networkError') {
      console.error('Network error', { e, data });
      this.setState({ videoError: 'Unable to load video. Check network connection.' });
    } else {
      const videoError = e.response?.code === 404
        ? 'This video segment has not uploaded yet or has been deleted.'
        : (e.response?.text || 'Unable to load video');
      this.setState({ videoError });
    }
    this.handOverToClock();
  }

  // compare against what we last sent, props can lag behind redux between media events
  updateBuffering() {
    const buffering = !this.videoFailed && isStalled(this.video);
    if (buffering !== this.buffering) {
      this.buffering = buffering;
      this.props.dispatch(bufferVideo(buffering));
    }
  }

  setVideoElement(el) {
    if (el === this.video) {
      return;
    }
    if (this.video) {
      detachVideo(this.video);
      this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
      this.video.removeEventListener('play', this.onPlay);
      this.video.removeEventListener('pause', this.onPause);
      this.video.removeEventListener('playing', this.onPlaying);
      this.video.removeEventListener('ended', this.onEnded);
      BUFFERING_EVENTS.forEach((ev) => this.video.removeEventListener(ev, this.updateBuffering));
    }
    this.video = el || null;
    if (this.video) {
      this.video.addEventListener('loadedmetadata', this.onLoadedMetadata);
      this.video.addEventListener('play', this.onPlay);
      this.video.addEventListener('pause', this.onPause);
      this.video.addEventListener('playing', this.onPlaying);
      this.video.addEventListener('ended', this.onEnded);
      BUFFERING_EVENTS.forEach((ev) => this.video.addEventListener(ev, this.updateBuffering));
      if (this.video.readyState > 0) {
        // metadata loaded before we started listening
        this.onLoadedMetadata();
      }
      this.updateBuffering();
    }
  }

  getPlaybackRate() {
    const { desiredPlaySpeed, isMuted } = this.props;
    if (desiredPlaySpeed > 0) {
      this.playSpeed = desiredPlaySpeed;
      // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x
      this.playbackRate = Math.min((isFirefox() && !isMuted) ? 8 : 16, desiredPlaySpeed);
    }
    // keep the last rate while paused, a rate of 0 is not valid
    return this.playbackRate;
  }

  updateVideoSource(prevProps) {
    const { src } = this.state;
    const { currentRoute } = this.props;
    if (!currentRoute) {
      if (src !== '') {
        this.setState({ src: '', videoError: null });
      }
      return;
    }

    if (src === '' || !prevProps.currentRoute || prevProps.currentRoute?.fullname !== currentRoute.fullname) {
      // the video of the previous route no longer keeps time
      if (this.video) {
        detachVideo(this.video);
      }
      this.videoFailed = false;
      this.setState({
        src: api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig),
        videoError: null,
      });
    }
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted, children } = this.props;
    const { src, videoError } = this.state;

    return (
      <div className="relative mx-auto aspect-[1.593] min-h-[200px] max-w-[min(964px,calc((100svh_-_90px)_*_1.593))]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          playbackRate={this.getPlaybackRate()}
          onReady={this.onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
          onError={this.onVideoError}
        />
        {children}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
  zoom: state.zoom,
  rangeLooping: state.rangeLooping,
});

export default connect(stateToProps)(DriveVideo);
