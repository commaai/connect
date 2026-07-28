/* eslint-disable camelcase */
import React, { Component, useEffect, useState } from 'react';
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

// Delay-show the spinner for a short window so brief stalls (e.g. a fast seek that
// briefly fires the video element's `waiting` event before data lands) don't flash
// a spinner. Hide is immediate. Error/missing overlays are NOT delayed.
const SPINNER_DELAY_MS = 250;

const VideoOverlay = ({ loading, error, missing, onSkip }) => {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return undefined;
    }
    const id = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(id);
  }, [loading]);

  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
      </>
    );
  } else if (missing) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>This video segment has not uploaded yet or has been deleted.</Typography>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-3 px-4 py-1.5 rounded-full text-sm bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            Skip to next segment
          </button>
        )}
      </>
    );
  } else if (showSpinner) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full bg-[#16181AAA]">
      <div className="relative text-center top-[calc(50%_-_50px)] flex flex-col items-center justify-center h-full">
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
      // Set of segment indices whose qcamera.ts returned 404. Tracked locally
      // because it's pure UI / playback concern.
      missingSegments: new Set(),
      // Index of the segment we're currently inside, if it's missing.
      // Mirrored into state so the overlay re-renders as the timeline crosses gap boundaries.
      currentMissingSegment: null,
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
    this.unmounted = true;
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
    this.bufferStartedAt = Date.now();
    console.debug('[DriveVideo] buffer start');
    dispatch(bufferVideo(true));
  }

  onVideoBufferEnd() {
    const { dispatch, isBufferingVideo } = this.props;
    const { videoError } = this.state;
    if (videoError) this.setState({ videoError: null });
    const dur = this.bufferStartedAt ? Date.now() - this.bufferStartedAt : null;
    this.bufferStartedAt = null;
    console.debug('[DriveVideo] buffer end', dur != null ? `(${dur}ms)` : '');
    if (isBufferingVideo) dispatch(bufferVideo(false));
  }

  /**
   * @param {object} e HLS.js error payload (type/details/response/frag/fatal)
   * @param {object} [hls] HLS.js instance, when available
   */
  onHlsError(e, hls) {
    const { dispatch } = this.props;

    if (e.type === 'mediaError' && (e.details === 'bufferStalledError' || e.details === 'bufferNudgeOnStall')) {
      // transient buffer hiccup, not a real error
      return;
    }

    // Per-segment 404: that segment's qcamera.ts wasn't uploaded (or has been deleted).
    // Record it so we can render the gap overlay, and recover so playback continues
    // for the rest of the route instead of failing the whole player.
    if (e.type === 'networkError' && e.details === 'fragLoadError' && e.response?.code === 404) {
      const fragUrl = e.frag?.url || '';
      const match = fragUrl.match(/\/(\d+)\/qcamera\.ts/);
      if (match) {
        const segIdx = parseInt(match[1], 10);
        this.setState((s) => {
          if (s.missingSegments.has(segIdx)) return null;
          const next = new Set(s.missingSegments);
          next.add(segIdx);
          console.debug('[DriveVideo] missing segment', segIdx, 'total missing:', next.size);
          return { missingSegments: next };
        });
      }
      // If HLS marked it fatal, try to recover so we can keep playing the rest.
      if (e.fatal && hls) {
        try { hls.recoverMediaError(); } catch (err) { console.debug('[DriveVideo] recoverMediaError failed', err); }
      }
      return;
    }

    dispatch(bufferVideo(true));
    if (e.type === 'networkError' && (e.response?.code === 404)) {
      this.setState({ videoError: 'This video segment has not uploaded yet or has been deleted.' });
    } else {
      this.setState({ videoError: 'Unable to load video' });
    }
  }

  /**
   * @param {Error|string} e
   * @param {any} [data]
   * @param {any} [hls]
   */
  onVideoError(e, data, hls) {
    if (!e) {
      console.warn('Unknown video error', { e, data });
      return;
    }

    if (e === 'hlsError') {
      this.onHlsError(data, hls);
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
      this.setState({
        src,
        videoError: null,
        missingSegments: new Set(),
        currentMissingSegment: null,
      });
      this.firstSeek = true;
      this.hls = null;
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

    // If the timeline is inside a known-missing segment, hold the video on its last
    // good frame, render the gap overlay, and let the timeline keep advancing on the
    // virtual clock. When timeline exits the gap, the normal push branch will seek
    // the video to the right spot.
    const missingSeg = this.missingSegmentAt();
    if (missingSeg !== this.state.currentMissingSegment) {
      this.setState({ currentMissingSegment: missingSeg });
    }
    if (missingSeg !== null) {
      if (!internalPlayer.paused) internalPlayer.pause();
      console.debug('[DriveVideo] sync', {
        cur: curVideoTime.toFixed(2),
        desired: desiredVideoTime.toFixed(2),
        action: 'in-missing-segment',
        seg: missingSeg,
      });
      return;
    }

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
        // After EOS (video reached end), seekTo alone doesn't wake HLS up:
        // the media clock keeps ticking but no frames are decoded. The user's
        // manual pause+play workaround recovers it, so we do the same here:
        // tell hls.js to actively start loading from the new position, then
        // cycle pause→play on the media element to force a clean resume.
        if (videoAtEnd) {
          if (this.hls) {
            try {
              this.hls.startLoad(desiredVideoTime);
              console.debug('[DriveVideo] hls.startLoad after wrap', desiredVideoTime.toFixed(2));
            } catch (err) {
              console.debug('[DriveVideo] hls.startLoad failed', err && err.message);
            }
          }
          internalPlayer.pause();
          // Defer the play() to the next microtask so pause() takes effect first.
          // The auto-resume block below would also call play(), but doing it inline
          // here means we don't wait an entire 500ms sync tick to recover.
          Promise.resolve().then(() => {
            if (this.unmounted) return;
            if (this.props.desiredPlaySpeed > 0 && internalPlayer.paused) {
              const playRes = internalPlayer.play();
              if (playRes) {
                playRes
                  .then(() => console.debug('[DriveVideo] post-wrap play resolved'))
                  .catch((err) => console.debug('[DriveVideo] post-wrap play rejected:', err && err.message));
              }
            }
          });
        }
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

  // Returns the segment index the timeline is currently inside if it's a known missing
  // segment, or null otherwise.
  missingSegmentAt(offset = currentOffset()) {
    const { currentRoute } = this.props;
    const { missingSegments } = this.state;
    if (!currentRoute || missingSegments.size === 0) {
      return null;
    }
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    const segIdx = Math.floor((offset - videoStartOffset) / 60000);
    return missingSegments.has(segIdx) ? segIdx : null;
  }

  // Route-time (ms) of the next segment after `fromSeg` whose qcamera is available, or
  // null if the rest of the route is missing.
  nextAvailableSegmentTime(fromSeg) {
    const { currentRoute } = this.props;
    const { missingSegments } = this.state;
    if (!currentRoute || fromSeg == null) return null;
    const videoStartOffset = currentRoute.videoStartOffset || 0;
    const segNumbers = currentRoute.segment_numbers || [];
    const maxSeg = segNumbers.length ? Math.max(...segNumbers) : fromSeg;
    for (let i = fromSeg + 1; i <= maxSeg; i++) {
      if (!missingSegments.has(i)) {
        return videoStartOffset + (i * 60000);
      }
    }
    return null;
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, onAudioStatusChange, isMuted, dispatch } = this.props;
    const { src, videoError, currentMissingSegment } = this.state;

    const inMissing = currentMissingSegment !== null;
    const skipTarget = inMissing ? this.nextAvailableSegmentTime(currentMissingSegment) : null;
    const onSkip = (skipTarget != null) ? () => dispatch(seek(skipTarget)) : null;

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
          // Stash the hls instance so syncVideo can poke its loader directly when the
          // video element gets stuck after end-of-stream → seek-back.
          this.hls = hlsPlayer;
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
        <VideoOverlay
          loading={isBufferingVideo && !inMissing}
          error={videoError}
          missing={inMissing}
          onSkip={onSkip}
        />
        <ReactPlayer
          ref={this.videoPlayer}
          url={src}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={Boolean(currentRoute && desiredPlaySpeed) && !inMissing}
          onReady={onPlayerReady}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: {
              maxBufferLength: 40,
              fragLoadingMaxRetry: 0,
              manifestLoadingMaxRetry: 2,
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
