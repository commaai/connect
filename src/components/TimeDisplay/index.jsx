import React from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { useVideo, useVideoMuted, useVideoPaused, useVideoPlaybackRate, useVideoTime } from '../../hooks/video';
import { clampRouteMsToLoop, getPlayheadRouteMs, videoSecondsToRouteMs, routeMsToVideoSeconds } from '../../timeline/routeTime';
import { videoPaused, videoPlayed, videoSeeked } from '../../timeline/playback';
import { getEffectivePlaybackRate, playIgnoringInterruptions, setPlaybackRate } from '../../timeline/video';
import { segmentAtRouteMs } from '../../utils';
import { playsHlsNatively } from '../../utils/browser.js';

const timerSteps = [
  0.1,
  0.25,
  0.5,
  1,
  2,
  4,
  8,
];

const iconButton = 'text-[length:inherit] w-[2.5em] h-[2.5em]';
const smallIcon = 'w-[80%] h-[80%]';
const tinyArrow = 'text-[length:inherit] w-[0.75em] h-[0.75em] text-[#424a4f] disabled:invisible';

function formatPlaybackTime(routeStartMs, routeMs) {
  const now = new Date(routeMs + routeStartMs);
  if (Number.isNaN(now.getTime())) return '...';
  const time = dayjs(now).format('HH:mm:ss');
  return `${time} – ${segmentAtRouteMs(routeMs)}`;
}

function speedStepIndex(playbackRate) {
  const index = timerSteps.indexOf(playbackRate);
  if (index === -1) return timerSteps.indexOf(1);
  return index;
}

function usePlaybackTimeText(routeStartMs, videoStartOffset) {
  const format = (videoSeconds) => formatPlaybackTime(routeStartMs, videoSecondsToRouteMs(videoStartOffset, videoSeconds));
  return useVideoTime(format, format(0));
}

const PlaybackTime = ({ className, routeStartMs, videoStartOffset }) => {
  const text = usePlaybackTimeText(routeStartMs, videoStartOffset);
  return (
    <Typography variant="body1" align="center" className={className}>
      {text}
    </Typography>
  );
};

const SpeedControl = ({ makeHandleSpeedChange }) => {
  const playbackRate = useVideoPlaybackRate();
  const speedIndex = speedStepIndex(playbackRate);
  const canIncreaseSpeed = speedIndex < timerSteps.length - 1;
  const canDecreaseSpeed = speedIndex > 0;
  return (
    <div className="flex flex-col items-center min-w-[2.5em] mr-[0.5em]">
      <IconButton
        className={tinyArrow}
        onClick={makeHandleSpeedChange(1)}
        disabled={!canIncreaseSpeed}
        aria-label="Increase play speed by 1 step"
      >
        <UpArrow className={tinyArrow} />
      </IconButton>
      <Typography variant="body2" align="center" className="text-[0.875em]">
        {playbackRate}
        ×
      </Typography>
      <IconButton
        className={tinyArrow}
        onClick={makeHandleSpeedChange(-1)}
        disabled={!canDecreaseSpeed}
        aria-label="Decrease play speed by 1 step"
      >
        <DownArrow className={tinyArrow} />
      </IconButton>
    </div>
  );
};

const MuteButton = ({ hasAudio, onToggle }) => {
  const muted = useVideoMuted();
  return (
    <Tooltip title={!hasAudio ? 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device' : ''}>
      <div>
        <IconButton
          className={iconButton}
          onClick={onToggle}
          disabled={!hasAudio}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted
            ? (<VolumeOff className={`${smallIcon} ${!hasAudio ? 'text-[#535f64]' : ''}`} />)
            : (<VolumeUp className={smallIcon} />)}
        </IconButton>
      </div>
    </Tooltip>
  );
};

const PlayPauseButton = ({ onToggle }) => {
  const paused = useVideoPaused();
  return (
    <IconButton
      className={iconButton}
      onClick={onToggle}
      aria-label={paused ? 'Unpause' : 'Pause'}
    >
      {paused
        ? (<PlayArrow className="w-[98%] h-[98%]" />)
        : (<Pause className="w-[98%] h-[98%]" />)}
    </IconButton>
  );
};

function TimeDisplay({ dispatch, currentRoute, loop, zoom, isThin, hasAudio }) {
  const video = useVideo();
  const videoStartOffset = currentRoute?.videoStartOffset;

  const handleJump = (amount) => {
    if (!video) return;
    const targetMs = clampRouteMsToLoop(getPlayheadRouteMs(videoStartOffset) + amount, loop);
    video.currentTime = routeMsToVideoSeconds(videoStartOffset, targetMs);
    dispatch(videoSeeked(targetMs, getEffectivePlaybackRate(video)));
  };

  const play = () => {
    playIgnoringInterruptions(video);
    dispatch(videoPlayed(getPlayheadRouteMs(videoStartOffset), getEffectivePlaybackRate(video)));
  };

  const makeHandleSpeedChange = (steps) => () => {
    if (!video) return;
    const lastIndex = timerSteps.length - 1;
    const nextIndex = Math.min(Math.max(speedStepIndex(video.playbackRate) + steps, 0), lastIndex);
    setPlaybackRate(video, timerSteps[nextIndex]);
    play();
  };

  const handlePauseToggle = () => {
    if (!video) return;
    if (video.paused) return play();
    video.pause();
    dispatch(videoPaused(getPlayheadRouteMs(videoStartOffset), getEffectivePlaybackRate(video)));
  };

  const handleMuteToggle = () => {
    if (!video) return;
    video.muted = !video.muted;
  };

  return (
    <div
      className={`flex items-center bg-[#0c0e0f] rounded-[2em] px-[0.5em] w-[25em] max-w-full mx-auto transition-opacity duration-100 ease-in-out
        ${isThin ? 'h-[3.125em] py-0' : 'h-[4em] py-[0.5em]'}
        ${zoom ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="border-r border-[#1e2224]">
        <PlayPauseButton onToggle={handlePauseToggle} />
      </div>
      <div className="border-r border-[#1e2224]">
        <IconButton
          className={iconButton}
          onClick={() => handleJump(-10000)}
          aria-label="Jump back 10 seconds"
        >
          <Replay10 className={`${smallIcon} text-[#535f64]`} />
        </IconButton>
      </div>
      <div className="border-r border-[#1e2224]">
        <IconButton
          className={iconButton}
          onClick={() => handleJump(10000)}
          aria-label="Jump forward 10 seconds"
        >
          <Forward10 className={`${smallIcon} text-[#535f64]`} />
        </IconButton>
      </div>
      {!isThin && (
        <Typography variant="caption" align="center" className="pt-1">
          CURRENT PLAYBACK TIME
        </Typography>
      )}
      <PlaybackTime
        className="block grow mx-[0.5em] text-[0.9375em] font-medium"
        routeStartMs={currentRoute?.start_time_utc_millis}
        videoStartOffset={videoStartOffset}
      />
      {!playsHlsNatively() && <SpeedControl makeHandleSpeedChange={makeHandleSpeedChange} />}
      <div className="border-l border-[#1e2224]">
        <MuteButton hasAudio={hasAudio} onToggle={handleMuteToggle} />
      </div>
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  loop: state.loop,
});

export default connect(stateToProps)(TimeDisplay);
