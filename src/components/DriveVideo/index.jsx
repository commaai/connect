import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { seekVideo, setVideo, videoTime } from '../../timeline';
import { bufferVideo, pause, play, resetPlayback } from '../../timeline/playback';
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

class RouteVideo extends Component {
  video = React.createRef();

  state = { videoError: null };

  async componentDidMount() {
    const { currentRoute, dispatch, onAudioStatusChange } = this.props;
    const video = this.video.current;
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

    setVideo(video);
    dispatch(resetPlayback());
    onAudioStatusChange?.(false);

    // iOS plays HLS itself. Everywhere else hls.js does, so only those browsers download it.
    const Hls = isIos() ? null : (await import('hls.js')).default;
    if (!this.video.current) {
      return; // unmounted while hls.js was loading
    }
    if (Hls?.isSupported()) {
      this.hls = new Hls({ maxBufferLength: 40 });
      this.hls.on(Hls.Events.BUFFER_CODECS, (event, data) => this.props.onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.loadSource(src);
      this.hls.attachMedia(video);
    } else {
      video.src = src;
    }
    this.syncPlayback();
  }

  componentDidUpdate(prevProps) {
    const { desiredPlaySpeed, loop } = this.props;
    if (desiredPlaySpeed !== prevProps.desiredPlaySpeed) {
      this.syncPlayback();
    }
    if (loop !== prevProps.loop) {
      // a newly selected range starts from its beginning, unless playback is already inside it
      const video = this.video.current;
      const [start, end] = this.loopRange();
      if (video.currentTime < start || video.currentTime >= end) {
        video.currentTime = start;
      }
    }
  }

  componentWillUnmount() {
    setVideo(null);
    this.hls?.destroy();
  }

  // redux holds how playback should be going: make the video match
  syncPlayback() {
    const { desiredPlaySpeed, dispatch } = this.props;
    const video = this.video.current;
    if (!desiredPlaySpeed) {
      video.pause();
      return;
    }
    video.playbackRate = desiredPlaySpeed;
    if (video.paused) {
      video.play()?.catch((error) => {
        if (error.name === 'NotAllowedError') {
          dispatch(pause()); // the browser wants a tap first, so show the play button
        }
      });
    }
  }

  // [start, end) of the selected range in video time. Empty when the whole route
  // is selected: that just plays to its end, like any video.
  loopRange() {
    const { loop, currentRoute } = this.props;
    if (!loop || loop.duration >= currentRoute.duration) {
      return [];
    }
    const start = videoTime(loop.startTime, currentRoute);
    const end = videoTime(loop.startTime + loop.duration, currentRoute);
    return end > start ? [start, end] : [];
  }

  setBuffering(buffering) {
    const { dispatch, isBufferingVideo } = this.props;
    if (buffering !== isBufferingVideo) {
      dispatch(bufferVideo(buffering));
    }
  }

  // play and pause also happen outside of connect (lock screen, headphones, the
  // OS interrupting), so redux follows what the video is actually doing
  onPlayPause = () => {
    const { desiredPlaySpeed, dispatch } = this.props;
    const video = this.video.current;
    if (!video.paused && !desiredPlaySpeed) {
      dispatch(play(video.playbackRate));
    } else if (video.paused && desiredPlaySpeed && !video.ended) {
      dispatch(pause());
    }
  };

  onWaiting = () => this.setBuffering(true);

  onCanPlay = () => {
    this.setBuffering(false);
    if (this.video.current.audioTracks?.length) {
      this.props.onAudioStatusChange?.(true); // Safari. With hls.js, BUFFER_CODECS says so.
    }
  };

  // hls.js stops loading once it gives up; seeking away is how the rest of the
  // route gets another go. A video element that errored itself is done.
  onSeeking = () => {
    const video = this.video.current;
    if (this.state.videoError && !video.error) {
      this.setState({ videoError: null });
      this.hls?.startLoad(video.currentTime);
    }
  };

  onTimeUpdate = () => {
    const video = this.video.current;
    const [start, end] = this.loopRange();
    if (!video.paused && video.currentTime >= end) {
      video.currentTime = start;
    }
  };

  onEnded = () => {
    const [start] = this.loopRange();
    if (start === undefined) {
      this.props.dispatch(pause());
    } else {
      this.video.current.currentTime = start;
      this.syncPlayback();
    }
  };

  onHlsError = (event, data) => {
    if (!data.fatal) {
      return; // hls.js retries by itself
    }
    let videoError = 'Unable to load video';
    if (data.response?.code === 404) {
      videoError = 'This video segment has not uploaded yet or has been deleted.';
    } else if (data.type === 'networkError') {
      videoError = 'Unable to load video. Check network connection.';
    }
    this.setState({ videoError });
  };

  onError = () => {
    this.setBuffering(true); // a dead video has nothing left to play
    this.setState({ videoError: 'Unable to load video' });
  };

  render() {
    const { desiredPlaySpeed, isBufferingVideo, isMuted } = this.props;
    const { videoError } = this.state;

    // Spin only while the video is trying to play and can't. An error only shows
    // once there is nothing left to play, not when a segment ahead fails to load.
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={isBufferingVideo && desiredPlaySpeed !== 0}
          error={isBufferingVideo && videoError}
        />
        <video
          ref={this.video}
          className="w-full h-full"
          playsInline
          muted={isMuted}
          onLoadedMetadata={() => seekVideo()}
          onPlay={this.onPlayPause}
          onPause={this.onPlayPause}
          onWaiting={this.onWaiting}
          onCanPlay={this.onCanPlay}
          onPlaying={this.onCanPlay}
          onSeeking={this.onSeeking}
          onTimeUpdate={this.onTimeUpdate}
          onEnded={this.onEnded}
          onError={this.onError}
        />
      </div>
    );
  }
}

// Every route gets its own video: a new element, hls.js instance and error state.
const DriveVideo = (props) => props.currentRoute && <RouteVideo key={props.currentRoute.fullname} {...props} />;

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
