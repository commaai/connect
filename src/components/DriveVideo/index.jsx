/* eslint-disable camelcase */
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { CircularProgress, Typography } from '@material-ui/core';
import ReactPlayer from 'react-player/file';

import { api } from '../../api/backend';

import Colors from '../../colors';
import { ErrorOutline } from '../../icons';
import { currentOffset, setPlayer } from '../../timeline';
import { seek, bufferVideo } from '../../timeline/playback';

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

    this.onReady = this.onReady.bind(this);
    this.onProgress = this.onProgress.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onError = this.onError.bind(this);
    this.setBuffering = this.setBuffering.bind(this);

    this.videoPlayer = React.createRef();

    this.state = {
      videoError: null,
    };
  }

  componentDidUpdate(prevProps) {
    const { currentRoute, seekId } = this.props;
    if (prevProps.currentRoute?.fullname !== currentRoute?.fullname) {
      // a new video, it reports itself once it has loaded
      this.ready = false;
      setPlayer(null);
      this.setState({ videoError: null });
      this.setBuffering(true);
    } else if (prevProps.seekId !== seekId) {
      this.seekVideo();
    }
  }

  componentWillUnmount() {
    setPlayer(null);
  }

  // the video can play. the first time, it becomes the clock and goes to where the state says
  onReady(player) {
    this.setBuffering(false);
    if (!this.ready) {
      this.ready = true;
      setPlayer(player);
      this.seekVideo();
      this.reportAudio(player);
    }
  }

  // keeps playback inside the selected range
  onProgress() {
    const { dispatch, loop } = this.props;
    if (loop?.duration && currentOffset() >= loop.startTime + loop.duration) {
      dispatch(seek(loop.startTime));
    }
  }

  onEnded() {
    const { dispatch, loop } = this.props;
    dispatch(seek(loop?.startTime ?? 0));
    this.videoPlayer.current?.getInternalPlayer()?.play?.()?.catch(() => {});
  }

  /**
   * @param {Error|string} e
   * @param {any} [data]
   */
  onError(e, data) {
    // hls.js recovers from everything that isn't fatal on its own
    if (e === 'hlsError' ? !data?.fatal : (!e || e.name === 'AbortError')) {
      return;
    }

    const notFound = (data?.response?.code ?? e.response?.code) === 404;
    this.setBuffering(true);
    this.setState({
      videoError: notFound
        ? 'This video segment has not uploaded yet or has been deleted.'
        : 'Unable to load video. Check network connection.',
    });
  }

  setBuffering(buffering) {
    const { dispatch, isBufferingVideo } = this.props;
    if (buffering !== isBufferingVideo) {
      dispatch(bufferVideo(buffering));
    }
    if (!buffering && this.state.videoError) {
      this.setState({ videoError: null });
    }
  }

  // the last seek, in the video's own time
  seekVideo() {
    const { currentRoute, offset } = this.props;
    const videoPlayer = this.videoPlayer.current;
    if (videoPlayer?.getDuration() && offset !== null) {
      videoPlayer.seekTo(Math.max(0, offset - (currentRoute?.videoStartOffset || 0)) / 1000, 'seconds');
    }
  }

  reportAudio(player) {
    const { onAudioStatusChange } = this.props;
    if (!onAudioStatusChange) {
      return;
    }
    const hls = player.getInternalPlayer('hls');
    if (hls) {
      // hls.js does not play the m3u8 directly, so the video element has no audioTracks
      hls.on('hlsBufferCodecs', (event, data) => onAudioStatusChange(Boolean(data.audio)));
    } else {
      onAudioStatusChange(player.getInternalPlayer()?.audioTracks?.length > 0);
    }
  }

  render() {
    const { desiredPlaySpeed, isBufferingVideo, currentRoute, isMuted, hidden } = this.props;
    const { videoError } = this.state;

    return (
      <div className={`min-h-[200px] relative max-w-[964px] m-[0_auto] aspect-[1.593] ${hidden ? 'hidden' : ''}`}>
        <VideoOverlay loading={isBufferingVideo} error={videoError} />
        {currentRoute && (
          <ReactPlayer
            ref={this.videoPlayer}
            url={api.video.getQcameraStreamUrl(currentRoute.fullname, currentRoute.share_exp, currentRoute.share_sig)}
            playsinline
            muted={isMuted}
            width="100%"
            height="100%"
            playing={desiredPlaySpeed > 0}
            playbackRate={desiredPlaySpeed || 1}
            progressInterval={100}
            config={{
              hlsVersion: '1.4.8',
              hlsOptions: {
                maxBufferLength: 40,
              },
            }}
            onReady={this.onReady}
            onProgress={this.onProgress}
            onEnded={this.onEnded}
            onError={this.onError}
            onBuffer={() => this.setBuffering(true)}
            onBufferEnd={() => this.setBuffering(false)}
            onPlay={() => this.setBuffering(false)}
          />
        )}
      </div>
    );
  }
}

const stateToProps = (state) => ({
  desiredPlaySpeed: state.desiredPlaySpeed,
  offset: state.offset,
  seekId: state.seekId,
  loop: state.loop,
  isBufferingVideo: state.isBufferingVideo,
  currentRoute: state.currentRoute,
});

export default connect(stateToProps)(DriveVideo);
