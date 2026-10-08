import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, pause, videoTime } from '../../timeline/playback';
import { isIos, isFirefox } from '../../utils/browser.js';

const VIDEO_EVENTS = [
  'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'pause', 'ended', 'waiting', 'stalled',
  'seeking', 'seeked', 'timeupdate', 'error',
];
const MAX_NETWORK_RETRIES = 3;
const MAX_MEDIA_RETRIES = 2;

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

// The <video> element is the playback clock. It reports where it is and whether it is waiting for
// data, and the redux state follows. Going the other way is limited to what the user asked for:
// play/pause and speed (through ReactPlayer's props) and seeks (applyOffset).
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.player = React.createRef();
    this.video = null;
    this.initialSeekDone = false;
    this.pendingSeek = false;
    this.networkRetries = 0;
    this.mediaRetries = 0;

    this.onReady = this.onReady.bind(this);
    this.onVideoEvent = this.onVideoEvent.bind(this);
    this.onVideoError = this.onVideoError.bind(this);

    this.state = {
      videoError: null,
    };
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, seekCount } = this.props;
    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      this.resetSource();
    } else if (prevProps.seekCount !== seekCount) {
      this.applyOffset();
    }
  }

  componentWillUnmount() {
    this.detachVideo();
  }

  onReady(player) {
    const { onAudioStatusChange } = this.props;
    const video = player.getInternalPlayer();
    this.attachVideo(video);

    if (isIos()) { // ios does not support hls.js and on other browsers hls.js does not directly play the m3u8 so audioTracks are not visible
      if (video?.audioTracks?.length > 0) {
        onAudioStatusChange?.(true);
      }
    } else { // on other platforms, inspect audio tracks before hls.js changes things
      player.getInternalPlayer('hls')?.on('hlsBufferCodecs', (event, data) => {
        onAudioStatusChange?.(!!data.audio);
      });
    }
  }

  onVideoEvent(event) {
    const { video } = this;
    const { dispatch, desiredPlaySpeed } = this.props;
    if (!video) {
      return;
    }

    switch (event.type) {
      case 'loadedmetadata':
        this.applyInitialOffset();
        break;
      case 'seeking':
        this.pendingSeek = true;
        break;
      case 'seeked':
        this.pendingSeek = false;
        this.reportTime();
        break;
      case 'timeupdate':
        this.reportTime();
        break;
      case 'playing':
        this.networkRetries = 0;
        this.mediaRetries = 0;
        if (this.state.videoError) this.setState({ videoError: null });
        break;
      case 'pause':
      case 'ended':
        // the browser or OS paused us (audio focus, ended): the state follows the video. Loading a
        // source also pauses the element, which is not a pause of playback.
        if (video.readyState >= 3 && desiredPlaySpeed !== 0) {
          dispatch(pause());
        }
        break;
      case 'error':
        this.onVideoError(event);
        break;
      default:
        break;
    }
    this.updateBuffering();
  }

  onVideoError(e, data) {
    if (e === 'hlsError') {
      this.onHlsError(data);
      return;
    }
    if (!e || e.name === 'AbortError') {
      return;
    }
    if (e.name === 'NotAllowedError') {
      // autoplay was blocked: the video is not playing, so the state must not claim it is
      this.props.dispatch(pause());
      return;
    }
    if (e.target?.src?.startsWith(window.location.origin) && e.target.src.endsWith('undefined')) {
      // the source is cleared while switching routes, not a real failure
      return;
    }
    this.setState({ videoError: e.response?.code === 404 ? 'This video segment has not uploaded yet or has been deleted.' : 'Unable to load video' });
  }

  /**
   * Non-fatal hls.js errors (stalls, nudges, retried fragments) are the player's own business; the
   * video's waiting/playing events already drive the spinner. Fatal ones are retried before giving up.
   */
  onHlsError(data) {
    if (!data?.fatal) {
      return;
    }
    const hls = this.player.current?.getInternalPlayer('hls');
    if (data.type === 'networkError' && data.response?.code !== 404 && hls && this.networkRetries < MAX_NETWORK_RETRIES) {
      this.networkRetries += 1;
      setTimeout(() => hls.startLoad(), 500 * this.networkRetries);
      return;
    }
    if (data.type === 'mediaError' && hls && this.mediaRetries < MAX_MEDIA_RETRIES) {
      this.mediaRetries += 1;
      hls.recoverMediaError();
      return;
    }

    let videoError = 'Unable to load video';
    if (data.type === 'networkError') {
      videoError = data.response?.code === 404
        ? 'This video segment has not uploaded yet or has been deleted.'
        : 'Unable to load video. Check network connection.';
    }
    this.setState({ videoError });
  }

  attachVideo(video) {
    if (video === this.video) {
      return;
    }
    this.detachVideo();
    this.video = video;
    VIDEO_EVENTS.forEach((name) => video.addEventListener(name, this.onVideoEvent));
    this.applyInitialOffset();
  }

  detachVideo() {
    if (this.video) {
      VIDEO_EVENTS.forEach((name) => this.video.removeEventListener(name, this.onVideoEvent));
      this.video = null;
    }
  }

  resetSource() {
    this.initialSeekDone = false;
    this.pendingSeek = false;
    this.networkRetries = 0;
    this.mediaRetries = 0;
    this.setState({ videoError: null });
  }

  // the first position of a source is wherever the state already is (a zoomed drive, a shared link)
  applyInitialOffset() {
    if (this.initialSeekDone || !this.video || this.video.readyState < 1) {
      return;
    }
    this.initialSeekDone = true;
    this.applyOffset();
  }

  // the state moved the playhead (seek, loop wrap, reset): make the video follow
  applyOffset() {
    const { video } = this;
    if (!video || !this.initialSeekDone) {
      return;
    }
    const offset = this.props.dispatch((_, getState) => currentOffset(getState()));
    const target = this.videoTimeFor(offset);
    if (Math.abs(video.currentTime - target) > 0.05) {
      this.pendingSeek = true;
      video.currentTime = target;
    }
  }

  reportTime() {
    const { video } = this;
    const { dispatch, currentRoute } = this.props;
    if (!video || !currentRoute || !this.initialSeekDone || this.pendingSeek || video.seeking) {
      return;
    }
    dispatch(videoTime(video.currentTime * 1000 + (currentRoute.videoStartOffset || 0)));
  }

  updateBuffering() {
    const { video } = this;
    const { dispatch, isBufferingVideo } = this.props;
    if (!video) {
      return;
    }
    const buffering = video.seeking || video.readyState < (video.paused ? 2 : 3);
    if (buffering !== isBufferingVideo) {
      dispatch(bufferVideo(buffering));
    }
  }

  videoTimeFor(offset) {
    const { currentRoute } = this.props;
    return Math.max(0, (offset - (currentRoute?.videoStartOffset || 0)) / 1000);
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { videoError } = this.state;

    const src = currentRoute
      ? api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)
      : '';
    // most browsers don't support more than 16x playback rate, firefox mutes audio above 8x
    const maxRate = (isFirefox() && !isMuted) ? 8 : 16;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        <ReactPlayer
          ref={this.player}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed)}
          playbackRate={Math.min(maxRate, desiredPlaySpeed || 1)}
          onReady={this.onReady}
          onError={this.onVideoError}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
            },
          }}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  seekCount: state.seekCount,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
