/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Button, CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import {
  setPlaybackSpeed, resetPlayback, play, pause, videoProgress, setHasAudio, setVideoStatus, VideoStatus,
} from '../../timeline/playback';

const MISSING_VIDEO = 'This video segment has not uploaded yet or has been deleted.';

const isMissing = (code) => code >= 400 && code < 500;

const VideoOverlay = ({ loading, error, onRetry }) => {
  let content;
  if (error) {
    content = (
      <>
        <ErrorOutline className="mb-2" />
        <Typography>{error}</Typography>
        {onRetry && <Button variant="outlined" className="mt-3" onClick={onRetry}>Retry</Button>}
      </>
    );
  } else if (loading) {
    content = <CircularProgress style={{ color: Colors.white }} thickness={4} size={50} />;
  } else {
    return null;
  }
  return (
    <div className="z-50 absolute h-full w-full flex flex-col items-center justify-center text-center bg-[#16181AAA]">
      {content}
    </div>
  );
};


class RouteVideo extends Component {
  player = React.createRef();
  ready = false;
  missing = []; // hls fragments that were never recorded or have been deleted
  state = { videoError: null, canRetry: false, attempt: 0 };

  componentDidMount() {
    this.props.dispatch(resetPlayback());
    window.addEventListener('online', this.onOnline);
  }

  // offset changes come from this video's own progress, re-rendering the player for them is wasted work
  shouldComponentUpdate(nextProps, nextState) {
    return nextState !== this.state || Object.keys(nextProps).some((key) => key !== 'offset' && nextProps[key] !== this.props[key]);
  }

  componentDidUpdate(prevProps) {
    const { seekRequest, loop, offset, currentRoute } = this.props;
    if (seekRequest && seekRequest !== prevProps.seekRequest) {
      this.seekTo(seekRequest.offset);
    } else if (loop !== prevProps.loop
      || (currentRoute.videoStartOffset || 0) !== (prevProps.currentRoute.videoStartOffset || 0)) {
      this.seekTo(offset);
    }
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('online', this.onOnline);
  }

  getVideo = () => this.player.current.getInternalPlayer();

  seekTo = (offset) => {
    if (!this.ready) return; // onReady applies the latest request after loading.
    const { currentRoute, loop } = this.props;
    const start = loop?.startTime ?? 0;
    const end = loop ? start + loop.duration : currentRoute.duration;
    const clamped = Math.max(start, Math.min(offset, end));
    this.seekToSeconds(Math.max(0, (clamped - (currentRoute.videoStartOffset || 0)) / 1000));
  };

  seekToSeconds = (seconds) => {
    const gap = this.findGap(seconds);
    if (gap) {
      this.skipGap(gap);
    } else {
      this.player.current.seekTo(seconds, 'seconds');
    }
  };

  findGap = (seconds, tolerance = 0) => this.missing.find((frag) => seconds >= frag.start - tolerance && seconds < frag.end);

  // Retrying won't make a missing segment appear, so play on from the next one.
  skipGap = (gap) => {
    if (gap.end >= this.getVideo().duration - 0.5) {
      this.onEnded();
    } else {
      this.seekToSeconds(gap.end + 0.1); // land inside the next fragment, currentTime gets rounded
    }
  };

  onReady = (player) => {
    if (this.ready) return;
    this.ready = true;
    this.seekTo(this.props.offset);
    const video = player.getInternalPlayer();
    const hls = player.getInternalPlayer('hls');
    if (hls) {
      hls.on('hlsBufferCodecs', (_event, data) => this.props.dispatch(setHasAudio(!!data.audio)));
    } else {
      this.props.dispatch(setHasAudio(!!video.audioTracks?.length));
    }
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  onAnimationFrame = () => {
    this.updateOffset(this.getVideo());
    this.frameId = requestAnimationFrame(this.onAnimationFrame);
  };

  updateOffset = (video) => {
    const { currentRoute, dispatch, loop, isPlaying, offset, videoStatus } = this.props;
    if (!this.ready || video.seeking || videoStatus === VideoStatus.FAILED) return;
    const nextOffset = Math.round(video.currentTime * 1000) + (currentRoute.videoStartOffset || 0);
    if (isPlaying && loop?.duration > 0 && nextOffset >= loop.startTime + loop.duration
      && loop.startTime + loop.duration > (currentRoute.videoStartOffset || 0)) {
      this.seekTo(loop.startTime);
    } else if (nextOffset !== offset) {
      dispatch(videoProgress(nextOffset));
    }
  };

  // a paused seek may not fire canplay or playing again, so seeked can end loading too
  onPlayable = () => {
    const video = this.getVideo();
    if (video.seeking || video.readyState < video.HAVE_CURRENT_DATA) return;
    this.setState({ videoError: null, canRetry: false });
    this.props.dispatch(setVideoStatus(VideoStatus.READY));
  };

  onBuffer = () => {
    const gap = this.findGap(this.getVideo().currentTime, 0.5);
    if (gap) {
      this.skipGap(gap);
    } else if (this.props.videoStatus !== VideoStatus.FAILED) {
      this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
    }
  };

  onSeeking = (event) => {
    this.setState({ videoError: null, canRetry: false });
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
    this.player.current.getInternalPlayer('hls')?.startLoad(event.target.currentTime);
  };

  onEnded = () => {
    const { isPlaying, loop, dispatch } = this.props;
    if (isPlaying && loop?.duration > 0) {
      this.seekTo(loop.startTime);
      this.getVideo().play().catch(this.onError);
    } else {
      dispatch(pause());
    }
  };

  onError = (error, data) => {
    if (error === 'hlsError') {
      if (data?.details === 'fragLoadError' && isMissing(data.response?.code)) {
        this.missing.push(data.frag);
        // skip it now if playback is there, otherwise onBuffer does once playback gets there
        const gap = this.findGap(this.getVideo().currentTime, 0.5);
        if (gap) this.skipGap(gap);
        return;
      }
      if (!data?.fatal) return; // hls.js handles retries and buffer stalls.
      error = data;
    }
    if (!error || error.name === 'AbortError') return;
    const { dispatch } = this.props;
    if (error.name === 'NotAllowedError') {
      dispatch(setVideoStatus(VideoStatus.READY));
      dispatch(pause()); // Leave the play button available after blocked autoplay.
      return;
    }
    const missing = isMissing(error.response?.code);
    dispatch(setVideoStatus(VideoStatus.FAILED));
    this.setState({ videoError: missing ? MISSING_VIDEO : 'Unable to load video', canRetry: !missing });
  };

  // a new player reloads the stream and resumes from the current offset in onReady
  retry = () => {
    cancelAnimationFrame(this.frameId);
    this.ready = false;
    this.missing = [];
    this.setState(({ attempt }) => ({ videoError: null, canRetry: false, attempt: attempt + 1 }));
    this.props.dispatch(setVideoStatus(VideoStatus.LOADING));
  };

  onOnline = () => {
    if (this.state.canRetry) this.retry();
  };

  render() {
    const { currentRoute, isPlaying, desiredPlaySpeed, videoStatus, isMuted, dispatch } = this.props;
    const { videoError, canRetry, attempt } = this.state;
    return (
      <div className="w-full relative max-w-[964px] m-[0_auto] aspect-[1.593]">
        <VideoOverlay
          loading={videoStatus === VideoStatus.LOADING}
          error={videoError}
          onRetry={canRetry ? this.retry : null}
        />
        <ReactPlayer
          key={attempt}
          ref={this.player}
          url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
          playsinline
          muted={isMuted}
          width="100%"
          height="100%"
          playing={isPlaying}
          playbackRate={desiredPlaySpeed}
          onReady={this.onReady}
          onBuffer={this.onBuffer}
          onBufferEnd={this.onPlayable}
          onPlay={() => {
            if (!isPlaying) dispatch(play());
          }}
          onPause={() => {
            if (isPlaying && !this.getVideo().ended) dispatch(pause());
          }}
          onPlaybackRateChange={(rate) => {
            if (rate !== desiredPlaySpeed) dispatch(setPlaybackSpeed(rate));
          }}
          onEnded={this.onEnded}
          onError={this.onError}
          config={{
            hlsVersion: '1.4.8',
            hlsOptions: { maxBufferLength: 40, ...api.video.getHlsOptions?.(currentRoute) },
            attributes: {
              onTimeUpdate: (event) => this.updateOffset(event.target),
              onSeeking: this.onSeeking,
              onSeeked: this.onPlayable,
              onCanPlay: this.onPlayable,
            },
          }}
        />
      </div>
    );
  }
}

const DriveVideo = (props) => props.currentRoute
  ? <RouteVideo key={props.currentRoute.fullname} {...props} />
  : null;

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekRequest: state.seekRequest,
  currentRoute: state.currentRoute,
  loop: state.loop,
  isPlaying: state.isPlaying,
  videoStatus: state.videoStatus,
});

export default connect(stateToProps)(DriveVideo);
