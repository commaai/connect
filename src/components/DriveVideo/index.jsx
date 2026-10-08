import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset } from '../../timeline';
import { bufferVideo, play, seek, videoPaused, videoPlaying } from '../../timeline/playback';
import { attachPlayer, detachPlayer, playerOffset } from '../../timeline/player';
import { parsePlaylist, skippedSegments } from '../../timeline/video';
import { hasNativeHls } from '../../utils/browser';

const NOT_UPLOADED = 'This video has not uploaded yet or has been deleted.';
const NETWORK_ERROR = 'Unable to load video. Check network connection.';

const VideoOverlay = ({ loading, error, notice }) => {
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
  } else if (notice) {
    return (
      <div className="z-50 absolute bottom-3 inset-x-0 text-center pointer-events-none">
        <Typography className="inline-block rounded-full bg-[#16181ACC] px-3 py-1">{notice}</Typography>
      </div>
    );
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

// Plays the current drive. The video is the playback clock: playback controls
// command it, and its own events (pausing, buffering, ending) update the store.
class DriveVideo extends Component {
  constructor(props) {
    super(props);

    this.video = React.createRef();
    this.segments = null;
    this.state = { attached: false, error: null, notice: null };

    this.onEvent = this.onEvent.bind(this);
    this.tick = this.tick.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    const video = this.video.current;
    video.muted = this.props.isMuted;
    for (const type of VIDEO_EVENTS) {
      video.addEventListener(type, this.onEvent);
    }
    this.props.dispatch(bufferVideo(true));
    this.load();
    this.frame = requestAnimationFrame(this.tick);
  }

  componentDidUpdate(prevProps) {
    const { isMuted, currentRoute } = this.props;
    this.video.current.muted = isMuted;
    if (this.state.attached && prevProps.currentRoute.videoStartOffset !== currentRoute.videoStartOffset) {
      attachPlayer(this.video.current, this.segments, currentRoute.videoStartOffset || 0);
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    cancelAnimationFrame(this.frame);
    this.detach();
    this.hls?.destroy();
    const video = this.video.current;
    for (const type of VIDEO_EVENTS) {
      video.removeEventListener(type, this.onEvent);
    }
    video.removeAttribute('src');
    video.load();
  }

  async load() {
    const { currentRoute, onAudioStatusChange } = this.props;
    const video = this.video.current;
    const src = api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig);

    // the playlist maps video time to the drive, around segments that were never uploaded
    let playlist;
    try {
      const resp = await fetch(src);
      if (!resp.ok) {
        this.fail(resp.status === 404 ? NOT_UPLOADED : 'Unable to load video');
        return;
      }
      playlist = await resp.text();
    } catch (err) {
      this.fail(NETWORK_ERROR);
      return;
    }
    if (!this.mounted) {
      return;
    }
    this.segments = parsePlaylist(playlist);

    video.addEventListener('loadedmetadata', () => {
      if (!this.hls) {
        onAudioStatusChange?.(Boolean(video.audioTracks?.length));
      }
      this.attach();
    }, { once: true });

    let Hls = null;
    if (!hasNativeHls()) {
      try {
        Hls = (await import('hls.js/light')).default;
      } catch (err) {
        this.fail(NETWORK_ERROR);
        return;
      }
    }
    if (!this.mounted) {
      return;
    }
    if (!Hls?.isSupported()) {
      video.src = src;
      return;
    }
    this.hls = new Hls({ maxBufferLength: 40 });
    this.hls.on(Hls.Events.BUFFER_CODECS, (_event, data) => onAudioStatusChange?.(Boolean(data.audio)));
    this.hls.on(Hls.Events.ERROR, (_event, data) => this.onHlsError(Hls, data));
    this.hls.loadSource(src);
    this.hls.attachMedia(video);
  }

  // start playing from wherever the timeline is
  attach() {
    const { currentRoute, desiredPlaySpeed, dispatch } = this.props;
    const offset = currentOffset();
    attachPlayer(this.video.current, this.segments, currentRoute.videoStartOffset || 0);
    this.setState({ attached: true });
    dispatch(seek(offset));
    if (desiredPlaySpeed) {
      dispatch(play(desiredPlaySpeed));
    }
  }

  // hand the clock back to the store, so the map and timeline keep going
  detach() {
    const offset = playerOffset();
    if (offset !== null) {
      detachPlayer(this.video.current);
      this.props.dispatch(seek(offset));
    }
    this.props.dispatch(bufferVideo(false));
  }

  fail(error) {
    if (this.mounted) {
      this.detach();
      this.setState({ error, attached: false });
    }
  }

  onHlsError(Hls, data) {
    if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR && data.response?.code === 404) {
      // a segment that is listed but not uploaded, play on after it
      this.video.current.currentTime = data.frag.start + data.frag.duration + 0.1;
      this.hls.startLoad(this.video.current.currentTime);
      return;
    }
    if (!data.fatal) {
      return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recoveredMediaError) {
      this.recoveredMediaError = true;
      this.hls.recoverMediaError();
    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      this.setState({ error: data.response?.code === 404 ? NOT_UPLOADED : NETWORK_ERROR });
      this.hls.startLoad(); // keeps trying, the error clears once it plays
    } else {
      this.fail('Unable to play video');
    }
  }

  onEvent(ev) {
    const video = this.video.current;
    const { desiredPlaySpeed, isBufferingVideo, loop, dispatch } = this.props;
    // hls.js handles its own errors
    if (ev.type === 'error' && video.error && !this.hls) {
      const loadError = this.state.attached ? 'Unable to play video' : NOT_UPLOADED;
      this.fail(video.error.code === video.error.MEDIA_ERR_NETWORK ? NETWORK_ERROR : loadError);
      return;
    }
    if (!this.state.attached) {
      return;
    }

    switch (ev.type) {
      case 'playing':
        if (this.state.error) {
          this.setState({ error: null });
        }
        break;
      case 'pause':
        // paused by the browser or OS, e.g. headphones were unplugged
        if (desiredPlaySpeed !== 0 && !video.ended) {
          dispatch(videoPaused(currentOffset()));
        }
        break;
      case 'play':
        // played by the browser or OS, e.g. from the lock screen
        if (desiredPlaySpeed === 0) {
          dispatch(videoPlaying(video.playbackRate, currentOffset()));
        }
        break;
      case 'ended':
        dispatch(seek(loop?.startTime ?? 0));
        dispatch(play(desiredPlaySpeed || 1));
        break;
      default:
        break;
    }

    const buffering = !video.paused && (video.seeking || video.readyState < video.HAVE_FUTURE_DATA);
    if (buffering !== isBufferingVideo) {
      dispatch(bufferVideo(buffering));
    }
  }

  tick() {
    this.frame = requestAnimationFrame(this.tick);
    if (!this.state.attached) {
      return;
    }

    const { loop, currentRoute, dispatch } = this.props;
    const offset = currentOffset();
    if (loop?.duration && !this.video.current.paused && offset >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }

    const skipped = skippedSegments(this.segments, currentRoute.videoStartOffset || 0, offset);
    const notice = skipped && (skipped.first === skipped.last
      ? `Segment ${skipped.first} was not uploaded`
      : `Segments ${skipped.first}–${skipped.last} were not uploaded`);
    if (notice !== this.state.notice) {
      this.setState({ notice });
    }
  }

  render() {
    const { isBufferingVideo } = this.props;
    const { attached, error, notice } = this.state;
    return (
      <div className="min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay loading={!attached || isBufferingVideo} error={error} notice={notice} />
        <video ref={this.video} className="w-full h-full" playsInline preload="auto" />
      </div>
    );
  }
}

const VIDEO_EVENTS = [
  'canplay', 'ended', 'error', 'pause', 'play', 'playing', 'seeked', 'seeking', 'stalled', 'timeupdate', 'waiting',
];

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
  loop: state.loop,
});

export default connect(stateToProps)(DriveVideo);
