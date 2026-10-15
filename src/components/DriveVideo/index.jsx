import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, routeOffset, setVideo, videoTime } from '../../timeline';
import { seek, videoPaused, videoPlayed } from '../../timeline/playback';

const LOADING_DELAY_MS = 250;
const RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;
const GAP_MARGIN = 0.25;
const GAP_EXIT = 0.001; // seek just past a gap's end, seeking to the end itself lands inside it
const POSITION_KEY = 'driveVideoPosition';

const MISSING_SEGMENT_ERROR = 'This video segment has not uploaded yet or has been deleted.';
const BROKEN_SEGMENT_ERROR = 'This video segment could not be played.';
const MISSING_VIDEO_ERROR = 'This video has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';
const VIDEO_ERROR = 'Unable to load video';

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

// start fetching hls.js while the drive list shows
if (typeof MediaSource !== 'undefined' || typeof ManagedMediaSource !== 'undefined') {
  import('hls.js/light').catch(() => {});
}

class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.onLoaded = this.onLoaded.bind(this);
    this.onFrame = this.onFrame.bind(this);
    this.onHlsError = this.onHlsError.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onSeeking = this.onSeeking.bind(this);
    this.onVideoError = this.onVideoError.bind(this);
    this.retry = this.retry.bind(this);
    this.savePosition = this.savePosition.bind(this);
    this.sync = this.sync.bind(this);

    this.video = React.createRef();
    this.hls = null;
    this.frame = null;
    this.loadingFrag = null;
    this.stopped = false;
    this.retryDelay = RETRY_DELAY_MS;
    this.retryAt = 0;
    this.reportedPaused = true;
    this.lastTime = 0;
    this.seekedBack = false;
    this.waitingSince = null;
    this.gaps = [];
    this.failure = null;
    this.recoveredMediaError = false;
    this.reloadedPlaylist = false;

    this.state = {
      blank: false,
      loading: false,
      videoError: null,
    };
  }

  componentDidMount() {
    const { currentRoute, desiredPlaySpeed, dispatch, onAudioStatusChange, zoom } = this.props;
    const video = this.video.current;
    this.mounted = true;
    video.defaultPlaybackRate = desiredPlaySpeed;
    setVideo(video);
    onAudioStatusChange?.(false);
    if (video.audioTracks) {
      video.audioTracks.onaddtrack = () => onAudioStatusChange?.(true);
    }
    window.addEventListener('online', this.retry);
    window.addEventListener('pagehide', this.savePosition);
    document.addEventListener('visibilitychange', this.savePosition);
    this.frame = requestAnimationFrame(this.onFrame);

    const saved = sessionStorage.getItem(POSITION_KEY);
    if (saved) {
      const position = JSON.parse(saved);
      if (position.route === currentRoute.fullname && position.zoom.start === zoom.start && position.zoom.end === zoom.end) {
        dispatch(seek(position.offset));
      }
    }

    this.loadSource();
  }

  componentDidUpdate(prevProps) {
    const { currentRoute } = this.props;
    const video = this.video.current;
    if (prevProps.currentRoute.videoStartOffset === currentRoute.videoStartOffset || video.readyState !== 0) {
      return;
    }

    if (!this.hls) {
      if (video.src) {
        video.currentTime = this.currentVideoTime();
      }
    } else if (this.hls.levels.length && this.currentVideoTime() !== this.hls.startPosition) {
      this.hls.startLoad(this.currentVideoTime());
    }
  }

  componentWillUnmount() {
    const video = this.video.current;
    this.mounted = false;
    setVideo(null);
    cancelAnimationFrame(this.frame);
    window.removeEventListener('online', this.retry);
    window.removeEventListener('pagehide', this.savePosition);
    document.removeEventListener('visibilitychange', this.savePosition);
    sessionStorage.removeItem(POSITION_KEY);

    if (this.hls) {
      this.hls.destroy();
    } else {
      video.removeAttribute('src');
      video.load();
    }
  }

  streamUrl() {
    const { currentRoute } = this.props;
    return api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);
  }

  async loadSource(autoplay = true) {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.video.current;

    let Hls = null;
    if (typeof MediaSource !== 'undefined' || typeof ManagedMediaSource !== 'undefined') {
      try {
        const hlsModule = await import('hls.js/light');
        Hls = hlsModule.default;
      } catch (err) {
        this.stopped = true;
        this.setLoadFailure();
        return;
      }
      if (!this.mounted || this.hls) {
        return;
      }
    }

    if (!Hls || !Hls.isSupported()) {
      video.src = this.streamUrl();
      video.currentTime = this.currentVideoTime();
    } else {
      const policy = Hls.DefaultConfig.fragLoadPolicy.default;
      this.hls = new Hls({
        autoStartLoad: false,
        maxBufferLength: 40,
        progressive: true,
        fragLoadPolicy: {
          default: {
            ...policy,
            errorRetry: { ...policy.errorRetry, retryDelayMs: 250 },
          },
        },
        ...api.video.getHlsConfig(currentRoute, Hls),
      });
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => this.hls.startLoad(this.currentVideoTime()));
      this.hls.on(Hls.Events.BUFFER_CODECS, (event, data) => onAudioStatusChange?.(Boolean(data.audio)));
      this.hls.on(Hls.Events.FRAG_LOADING, (event, data) => { this.loadingFrag = data.frag; });
      this.hls.on(Hls.Events.FRAG_LOADED, () => { this.loadingFrag = null; });
      this.hls.on(Hls.Events.FRAG_BUFFERED, (event, data) => {
        this.gaps = this.gaps.filter((g) => g.start !== data.frag.start);
        this.onLoaded();
      });
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.loadSource(this.streamUrl());
      this.hls.attachMedia(video);
    }
    if (autoplay) {
      this.play();
    }
  }

  onFrame() {
    this.frame = requestAnimationFrame(this.onFrame);
    this.sync();
  }

  sync() {
    const video = this.video.current;
    const moved = video.currentTime !== this.lastTime;
    const advancing = moved && !video.seeking;
    if (moved) {
      this.seekedBack = video.seeking && video.currentTime < this.lastTime;
    }
    this.lastTime = video.currentTime;
    this.checkPosition();
    this.reportPlayState();

    let waiting = video.seeking;
    if (!video.paused && !advancing && (video.readyState < 3 || video.error)) {
      waiting = true;
    }
    if (!waiting) {
      this.waitingSince = null;
    } else if (this.waitingSince === null) {
      this.waitingSince = performance.now();
    }
    const loading = this.waitingSince !== null && performance.now() - this.waitingSince > LOADING_DELAY_MS;
    if (loading && this.stopped && this.failure !== MISSING_VIDEO_ERROR && performance.now() > this.retryAt) {
      this.retryAt = performance.now() + this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY_MS);
      this.retry();
    }
    this.updateOverlay(video, loading);
  }

  onPlay() {
    const { currentRoute, zoom } = this.props;
    const gap = this.reachedGap();
    if (currentOffset() < zoom.start || this.isPastVideoEnd() || (gap && gap.end >= this.videoEnd())) {
      this.video.current.currentTime = this.skipGap(videoTime(currentRoute, zoom.start));
    }
    this.sync();
    this.retry();
  }

  onSeeking() {
    // hls.js keeps stale data from a half-parsed segment it cancels for a seek,
    // then reloads the one before
    const frag = this.loadingFrag;
    const time = this.video.current.currentTime;
    if (frag && !this.stopped && (time < frag.start - GAP_MARGIN || time > frag.end + GAP_MARGIN)
      && !this.bufferedTo(frag, time)) {
      this.hls.startLoad(time);
    }
    this.sync();
    this.retry();
  }

  onLoaded() {
    this.failure = null;
    this.retryDelay = RETRY_DELAY_MS;
    this.retryAt = 0;
    this.reloadedPlaylist = false;
  }

  onHlsError(event, data) {
    const { frag, response } = data;
    const missing = response?.code === 404;
    if (frag && (missing || data.details === 'fragParsingError')) {
      this.addGap(frag, missing ? MISSING_SEGMENT_ERROR : BROKEN_SEGMENT_ERROR);
      if (data.fatal) {
        this.stopped = true;
      }
      return;
    }
    // segment links expire a day after the playlist loads
    if (frag && response?.code === 403 && !this.reloadedPlaylist) {
      this.reloadedPlaylist = true;
      this.reload(currentOffset(), true);
      return;
    }

    if (!data.fatal) {
      return;
    }

    if (data.details === 'manifestLoadError' && response?.code === 404) {
      this.video.current.pause();
      this.stopped = true;
      this.failure = MISSING_VIDEO_ERROR;
    } else if (data.type === 'mediaError' && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.reload(currentOffset());
    } else {
      this.stopped = true;
      this.setLoadFailure();
    }
  }

  onVideoError() {
    const { currentRoute } = this.props;
    const video = this.video.current;
    if (!video.error) {
      return;
    }
    if (!this.hls) {
      this.setLoadFailure();
      return;
    }

    // hls.js doesn't report the browser failing to decode a segment
    const frag = this.hls.latestLevelDetails?.fragments.find((f) => video.currentTime < f.end);
    if (video.error.code === 3 && frag) {
      this.addGap(frag, BROKEN_SEGMENT_ERROR);
      if (frag.end >= this.videoEnd()) {
        video.pause();
      } else {
        this.reload(routeOffset(currentRoute, frag.end + GAP_EXIT));
      }
    }
  }

  setLoadFailure() {
    this.failure = navigator.onLine ? VIDEO_ERROR : NETWORK_ERROR;
  }

  retry() {
    if (this.video.current.error) {
      this.recoveredMediaError = false;
      this.reload(currentOffset());
    } else if (this.stopped) {
      this.stopped = false;
      this.recoveredMediaError = false;
      if (!this.hls) {
        this.loadSource(!this.reportedPaused);
      } else if (this.hls.levels.length) {
        this.hls.startLoad(this.currentVideoTime());
      } else {
        this.hls.loadSource(this.streamUrl());
      }
    }
  }

  reload(offset, playlist = false) {
    if (playlist) {
      this.hls.loadSource(this.streamUrl());
    } else if (this.hls) {
      this.hls.recoverMediaError();
    } else {
      this.video.current.load();
    }
    this.stopped = false;
    this.props.dispatch(seek(offset));
    this.hls?.startLoad(this.currentVideoTime());
    if (!this.reportedPaused) {
      this.play();
    }
  }

  checkPosition() {
    const { currentRoute, zoom } = this.props;
    const video = this.video.current;
    const time = this.currentVideoTime();
    const gap = this.reachedGap();
    if (this.seekedBack && gap && time >= gap.start) {
      const back = gap.start - (gap.end - time);
      if (back >= videoTime(currentRoute, zoom.start)) {
        this.seekVideo(back);
        return;
      }
    }
    if (this.reportedPaused) {
      return;
    }

    const loaded = video.readyState >= 1;
    if (loaded && this.noVideoInRange()) {
      video.pause();
      return;
    }
    const atEnd = video.ended || (!video.paused && currentOffset() >= zoom.end);
    if (loaded && zoom.start < zoom.end && atEnd) {
      let segmentsMissing = false;
      if (video.ended && this.hls && this.hls.latestLevelDetails && currentRoute.segment_numbers) {
        segmentsMissing = this.hls.latestLevelDetails.fragments.length < currentRoute.segment_numbers.length;
      }
      if (this.isPastVideoEnd() || segmentsMissing) {
        video.pause();
      } else {
        video.currentTime = this.skipGap(videoTime(currentRoute, zoom.start));
        this.play();
      }
      return;
    }

    if (!gap || video.paused || !this.hls.latestLevelDetails) {
      return;
    }
    if (gap.end >= this.videoEnd()) {
      video.pause();
    } else {
      this.seekVideo(gap.end + GAP_EXIT);
    }
  }

  seekVideo(time) {
    const { currentRoute, dispatch } = this.props;
    if (this.video.current.readyState >= 1) {
      this.video.current.currentTime = time;
    } else {
      dispatch(seek(routeOffset(currentRoute, time)));
    }
    this.stopped = false;
    this.hls.startLoad(time);
  }

  reachedGap() {
    const time = this.currentVideoTime();
    const buffering = this.video.current.readyState < 3;
    return this.gaps.find((gap) => {
      if (time >= gap.end) {
        return false;
      }
      return time >= gap.start || (buffering && time > gap.start - GAP_MARGIN);
    });
  }

  reportPlayState() {
    const video = this.video.current;
    if (video.paused !== this.reportedPaused) {
      this.reportedPaused = video.paused;
      const offset = currentOffset();
      this.props.dispatch(video.paused ? videoPaused(offset) : videoPlayed(offset));
    }
  }

  videoEnd() {
    const { currentRoute, zoom } = this.props;
    let end = this.video.current.duration;
    if (!end) {
      end = this.hls.latestLevelDetails?.fragmentEnd;
    }
    return Math.min(videoTime(currentRoute, zoom.end), end);
  }

  isPastVideoEnd() {
    return currentOffset() > routeOffset(this.props.currentRoute, this.video.current.duration);
  }

  addGap(frag, error) {
    if (!this.gaps.some((g) => g.start === frag.start)) {
      this.gaps.push({ start: frag.start, end: frag.end, error });
    }
  }

  bufferedTo(frag, time) {
    const { buffered } = this.video.current;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= time && time < buffered.end(i)) {
        return buffered.end(i) >= frag.start - GAP_MARGIN && buffered.start(i) <= frag.end + GAP_MARGIN;
      }
    }
    return false;
  }

  gapAt(time) {
    return this.gaps.find((g) => time >= g.start && time < g.end);
  }

  skipGap(time) {
    const gap = this.gapAt(time);
    return gap ? gap.end + GAP_EXIT : time;
  }

  noVideoInRange() {
    const { currentRoute, zoom } = this.props;
    const videoStart = currentRoute.videoStartOffset || 0;
    return zoom.end <= videoStart || videoTime(currentRoute, zoom.start) >= this.video.current.duration;
  }

  // Safari reloads background pages when memory runs low
  savePosition() {
    const { currentRoute, zoom } = this.props;
    sessionStorage.setItem(POSITION_KEY, JSON.stringify({ route: currentRoute.fullname, zoom, offset: currentOffset() }));
  }

  currentVideoTime() {
    return videoTime(this.props.currentRoute, currentOffset());
  }

  play() {
    this.video.current.play().catch(() => {});
  }

  updateOverlay(video, loading) {
    let missing = null;
    if (video.paused) {
      const gap = this.gapAt(this.currentVideoTime());
      if (gap) {
        missing = gap.error;
      } else if (this.isPastVideoEnd() || this.noVideoInRange()) {
        missing = MISSING_SEGMENT_ERROR;
      }
    }

    let videoError = missing;
    if (!missing && (loading || video.readyState < 2)) {
      videoError = this.failure;
      if (!videoError && loading && !navigator.onLine) {
        videoError = NETWORK_ERROR;
      }
    }
    const blank = Boolean(missing);
    if (blank !== this.state.blank || loading !== this.state.loading || videoError !== this.state.videoError) {
      this.setState({ blank, loading, videoError });
    }
  }

  render() {
    const { isMuted } = this.props;
    const { blank, loading, videoError } = this.state;

    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={loading} error={videoError} />
        <video
          ref={this.video}
          className={`h-full w-full ${blank ? 'invisible' : ''}`}
          muted={isMuted}
          playsInline
          onCanPlay={this.onLoaded}
          onError={this.onVideoError}
          onPause={this.sync}
          onPlay={this.onPlay}
          onSeeking={this.onSeeking}
          onTimeUpdate={this.sync}
          onWaiting={this.sync}
        />
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  desiredPlaySpeed: state.desiredPlaySpeed,
  zoom: state.zoom,
});

export default connect(stateToProps)(DriveVideo);
