/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, setVideo } from '../../timeline';
import { bufferVideo, pause, seek } from '../../timeline/playback';
import { parseQcameraPlaylist, routeToVideoTime, videoToRouteOffset } from '../../timeline/videoTime';

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        <Button style={{ color: Colors.white }} onClick={onRetry}>Try again</Button>
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  // fade the spinner in late, so quick seeks don't flash it
  const fadeIn = error ? '' : 'transition-opacity delay-300 starting:opacity-0';
  return (
    <div className={`z-50 absolute h-full w-full bg-[#16181AAA] ${fadeIn}`}>
      <div className="relative text-center top-[calc(50%_-_25px)]">
        {content}
      </div>
    </div>
  );
};

// The video is the playback clock: while it plays, currentOffset reads its playhead. Without
// a playable video, the timeline's own clock continues from where the video left off.
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onLoadedMetadata = this.onLoadedMetadata.bind(this);
    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onBuffering = this.onBuffering.bind(this);
    this.onPlayable = this.onPlayable.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.onPlayerReady = this.onPlayerReady.bind(this);
    this.retry = this.retry.bind(this);

    this.videoPlayer = React.createRef();
    this.source = null; // what currentOffset reads while the video is the clock
    this.segments = null; // segments in the video playlist, null if unknown
    this.playlistLoaded = Promise.resolve();

    this.state = {
      videoError: null,
      loadCount: 0,
    };
  }

  componentDidMount() {
    this.loadRoute();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, seekRevision, offset, desiredPlaySpeed } = this.props;
    if (currentRoute?.fullname !== prevProps.currentRoute?.fullname) {
      this.loadRoute();
    } else if (seekRevision !== prevProps.seekRevision) {
      this.seekVideo(offset);
    } else if (desiredPlaySpeed !== prevProps.desiredPlaySpeed) {
      this.scheduleLoop();
    }
  }

  componentWillUnmount() {
    this.stopClock();
  }

  // the video becomes the clock, starting where the timeline is (the start of the range, or a
  // seek made while loading)
  onLoadedMetadata(ev) {
    const element = ev.target;
    const route = this.props.currentRoute.fullname;
    this.playlistLoaded.then(() => {
      if (route === this.props.currentRoute?.fullname && element === this.videoPlayer.current?.getInternalPlayer()) {
        const offset = currentOffset();
        this.attach(element);
        this.seekVideo(offset);
      }
    });
  }

  onTimeUpdate() {
    const { desiredPlaySpeed, loop, dispatch } = this.props;
    const element = this.source?.element;
    if (!element || element.seeking) {
      return;
    }
    // native HLS can fire waiting without a matching playing: a moving playhead isn't buffering
    if (!element.paused && element.readyState >= 2) {
      this.setBuffering(false);
    }
    if (desiredPlaySpeed && loop?.duration > 0 && currentOffset() >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }
  }

  onBuffering() {
    if (!this.pastVideo) {
      this.setBuffering(true);
    }
  }

  onPlayable() {
    if (this.videoPlayer.current?.getInternalPlayer()?.readyState >= 2) {
      this.setBuffering(false);
    }
  }

  // the OS paused us (lock screen, headphones unplugged, ...)
  onPause() {
    if (this.props.desiredPlaySpeed && this.source && !this.source.element.ended) {
      this.props.dispatch(pause());
    }
  }

  onEnded() {
    const { loop, dispatch } = this.props;
    if (this.pastVideo) {
      return; // moved to its end by playPastVideo
    }
    if (!(loop?.duration > 0) || !this.source) {
      dispatch(pause());
    } else if (currentOffset() < loop.startTime + loop.duration - 1000) {
      this.playPastVideo(this.source.element);
    } else {
      dispatch(seek(loop.startTime)); // the selected range, or the whole route, starts over
    }
  }

  onVideoError(e, data) {
    if (e === 'hlsError') {
      if (!data?.fatal) {
        return; // hls.js retries these itself
      }
      e = data;
    }
    if (!e || e.name === 'AbortError') {
      return;
    }

    if (e.name === 'NotAllowedError') {
      // autoplay was blocked (e.g. iOS PWA): leave the play button for the user
      this.props.dispatch(pause());
      this.setBuffering(false);
      return;
    }

    // a missing playlist is a 404 with hls.js, and an unsupported source with native HLS (Safari)
    const missing = e.response?.code === 404 || e.target?.error?.code === 4;
    this.stopClock();
    this.setState({
      videoError: missing ? 'This video segment has not uploaded yet or has been deleted.' : 'Unable to load video',
    });
  }

  onPlayerReady(player) {
    const { onAudioStatusChange } = this.props;
    const hlsPlayer = player.getInternalPlayer('hls');
    if (hlsPlayer) {
      // hls.js hides the stream's audio tracks, so inspect its codecs instead
      hlsPlayer.on('hlsBufferCodecs', (event, data) => onAudioStatusChange?.(!!data.audio));
    } else if (player.getInternalPlayer()?.audioTracks?.length > 0) {
      onAudioStatusChange?.(true);
    }
  }

  setBuffering(buffering) {
    if (buffering !== this.props.isBufferingVideo) {
      this.props.dispatch(bufferVideo(buffering));
    }
  }

  getVideoUrl() {
    const { currentRoute } = this.props;
    return api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
  }

  loadRoute() {
    this.stopClock();
    this.setState({ videoError: null });
    if (this.props.currentRoute) {
      this.props.dispatch(bufferVideo(true));
      this.loadPlaylist();
    }
  }

  // the playlist says which segments have video, to line the video up with the route around missing ones
  loadPlaylist() {
    const route = this.props.currentRoute.fullname;
    this.segments = null;
    this.playlistLoaded = fetch(this.getVideoUrl(), { signal: AbortSignal.timeout?.(10000) })
      .then((res) => res.text())
      .then((text) => {
        if (route === this.props.currentRoute?.fullname) {
          this.segments = parseQcameraPlaylist(text);
        }
      })
      .catch(() => {}); // the video reports its own errors
  }

  retry() {
    this.setState(({ loadCount }) => ({ loadCount: loadCount + 1 }));
    this.loadRoute();
  }

  attach(element) {
    this.source = {
      element,
      route: this.props.currentRoute.fullname,
      toRouteOffset: (time) => videoToRouteOffset(this.props.currentRoute, this.segments, time),
    };
    setVideo(this.source);
  }

  // Past the end of the video (e.g. the drive is still uploading) the timeline's clock plays out
  // the logs, and the range starts over, with the video, when it reaches its end.
  playPastVideo(element) {
    this.stopClock();
    element.pause();
    element.currentTime = element.duration; // show its last frame
    this.pastVideo = element;
    this.scheduleLoop();
  }

  scheduleLoop() {
    clearTimeout(this.loopTimeout);
    const { loop, desiredPlaySpeed, dispatch } = this.props;
    if (this.pastVideo && desiredPlaySpeed && loop?.duration > 0) {
      const remaining = loop.startTime + loop.duration - currentOffset();
      this.loopTimeout = setTimeout(() => dispatch(seek(loop.startTime)), remaining / desiredPlaySpeed);
    }
  }

  // hand the clock back to the timeline
  stopClock() {
    clearTimeout(this.loopTimeout);
    this.pastVideo = null;
    // while the video is still attached, this sets the timeline's clock to its playhead
    this.props.dispatch(bufferVideo(false));
    this.source = null;
    setVideo(null);
  }

  seekVideo(offset) {
    const element = this.source?.element || this.pastVideo;
    if (!element) {
      return; // once loaded, the video starts at the timeline's position
    }
    const { currentRoute, loop } = this.props;
    const time = routeToVideoTime(currentRoute, this.segments, offset);
    // past the end of the video, or a range that is all in a segment without video
    if (time >= element.duration
      || (loop?.duration > 0 && videoToRouteOffset(currentRoute, this.segments, time) >= loop.startTime + loop.duration)) {
      setVideo(null); // the seek already put the timeline's clock at the offset, continue from there
      this.playPastVideo(element);
      return;
    }
    element.currentTime = time; // before play(), which would restart an ended video from 0
    if (!this.source) {
      this.pastVideo = null;
      clearTimeout(this.loopTimeout);
      this.attach(element);
    }
    if (this.props.desiredPlaySpeed && element.paused) {
      element.play().catch(() => {}); // after its end, or coming back from past it
    }
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted } = this.props;
    const { videoError, loadCount } = this.state;

    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={isBufferingVideo} error={videoError} onRetry={this.retry} />
        {currentRoute && (
          <ReactPlayer
            key={`${currentRoute.fullname}:${loadCount}`}
            ref={this.videoPlayer}
            url={this.getVideoUrl()}
            playsinline
            muted={isMuted}
            width="100%"
            height="100%"
            playing={Boolean(desiredPlaySpeed) && !videoError && !this.pastVideo}
            playbackRate={desiredPlaySpeed || 1}
            onReady={this.onPlayerReady}
            config={{
              hlsVersion: '1.4.8',
              hlsOptions: {
                maxBufferLength: 40,
              },
              attributes: {
                onLoadedMetadata: this.onLoadedMetadata,
                onTimeUpdate: this.onTimeUpdate,
                onSeeking: this.onBuffering,
                onSeeked: this.onPlayable,
              },
            }}
            onBuffer={this.onBuffering}
            onBufferEnd={this.onPlayable}
            onPause={this.onPause}
            onEnded={this.onEnded}
            onError={this.onVideoError}
          />
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRevision: state.seekRevision,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
