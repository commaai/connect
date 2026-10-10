import React from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { useVideo, useVideoMuted, useVideoPaused, useVideoPlaybackRate, useVideoTime } from '../../hooks/video';
import { getCurrentRouteMs, seekToRouteMs, toRouteMs } from '../../timeline/routeTime';
import { videoPaused, videoPlayed, videoSeeked } from '../../timeline/playback';
import { getPlaybackSpeed, playIgnoringInterruptions, setPlaybackRate } from '../../timeline/video';
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

const styles = (theme) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: theme.palette.grey[999],
    height: '4em',
    borderRadius: '2em',
    padding: '0.5em',
    width: '25em',
    maxWidth: '100%',
    margin: '0 auto',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.1s ease-in-out',
    '&.isExpanded': {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '&.isThin': {
      height: '3.125em',
      paddingBottom: 0,
      paddingTop: 0,
    },
  },
  desiredPlaySpeedContainer: {
    marginRight: '0.5em',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '2.5em',
  },
  icon: {
    width: '98%',
    height: '98%',
    '&.dim': {
      color: theme.palette.grey[300],
    },
    '&.small': {
      width: '80%',
      height: '80%',
    },
    '&.circle': {
      border: `1px solid ${theme.palette.grey[900]}`,
      borderRadius: '50%',
    },
  },
  iconButton: {
    fontSize: 'inherit',
    width: '2.5em',
    height: '2.5em',
  },
  tinyArrowIcon: {
    fontSize: 'inherit',
    width: '0.75em',
    height: '0.75em',
    color: theme.palette.grey[500],
    '&[disabled]': {
      visibility: 'hidden',
    },
  },
  rightBorderBox: {
    borderRight: `1px solid ${theme.palette.grey[900]}`,
  },
  leftBorderBox: {
    borderLeft: `1px solid ${theme.palette.grey[900]}`,
  },
  desiredPlaySpeed: {
    fontSize: '0.875em',
  },
  currentTime: {
    margin: '0 0.5em',
    fontSize: '0.9375em',
    fontWeight: 500,
    display: 'block',
    flexGrow: 1,
  },
});

function formatPlaybackTime(routeStartMs, routeMs) {
  const now = new Date(routeMs + routeStartMs);
  if (Number.isNaN(now.getTime())) return '...';
  const time = dayjs(now).format('HH:mm:ss');
  return `${time} \u2013 ${segmentAtRouteMs(routeMs)}`;
}

function speedStepIndex(playbackRate) {
  const index = timerSteps.indexOf(playbackRate);
  if (index === -1) return timerSteps.indexOf(1);
  return index;
}

function usePlaybackTimeText(routeStartMs, videoStartOffset) {
  const format = (videoSeconds) => formatPlaybackTime(routeStartMs, toRouteMs(videoStartOffset, videoSeconds));
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

const SpeedControl = ({ classes, makeHandleSpeedChange }) => {
  const playbackRate = useVideoPlaybackRate();
  const speedIndex = speedStepIndex(playbackRate);
  const canIncreaseSpeed = speedIndex < timerSteps.length - 1;
  const canDecreaseSpeed = speedIndex > 0;
  return (
    <div className={ classes.desiredPlaySpeedContainer }>
      <IconButton
        className={classes.tinyArrowIcon}
        onClick={makeHandleSpeedChange(1)}
        disabled={!canIncreaseSpeed}
        aria-label="Increase play speed by 1 step"
      >
        <UpArrow className={classes.tinyArrowIcon} />
      </IconButton>
      <Typography variant="body2" align="center" className={classes.desiredPlaySpeed}>
        {playbackRate}
        ×
      </Typography>
      <IconButton
        className={classes.tinyArrowIcon}
        onClick={makeHandleSpeedChange(-1)}
        disabled={!canDecreaseSpeed}
        aria-label="Decrease play speed by 1 step"
      >
        <DownArrow className={classes.tinyArrowIcon} />
      </IconButton>
    </div>
  );
};

const MuteButton = ({ classes, hasAudio, onToggle }) => {
  const muted = useVideoMuted();
  return (
    <Tooltip title={ !hasAudio ? "Enable audio recording through the \"Record and Upload Microphone Audio\" toggle on your device" : '' }>
      <div>
        <IconButton
          className={ classes.iconButton }
          onClick={onToggle}
          disabled={!hasAudio}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted
            ? (<VolumeOff className={`${classes.icon} small ${!hasAudio ? 'dim' : ''}`} />)
            : (<VolumeUp className={`${classes.icon} small`} />)}
        </IconButton>
      </div>
    </Tooltip>
  );
};

const PlayPauseButton = ({ classes, onToggle }) => {
  const paused = useVideoPaused();
  return (
    <IconButton
      className={ classes.iconButton }
      onClick={onToggle}
      aria-label={paused ? 'Unpause' : 'Pause'}
    >
      {paused
        ? (<PlayArrow className={classes.icon} />)
        : (<Pause className={classes.icon} />)}
    </IconButton>
  );
};

function TimeDisplay({ classes, dispatch, currentRoute, loop, zoom, isThin, hasAudio }) {
  const video = useVideo();
  const videoStartOffset = currentRoute?.videoStartOffset;

  const handleJump = (amount) => {
    if (!video) return;
    const targetMs = seekToRouteMs(video, videoStartOffset, getCurrentRouteMs(videoStartOffset) + amount, loop);
    dispatch(videoSeeked(targetMs, getPlaybackSpeed(video)));
  };

  const play = () => {
    playIgnoringInterruptions(video);
    dispatch(videoPlayed(getCurrentRouteMs(videoStartOffset), getPlaybackSpeed(video)));
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
    dispatch(videoPaused(getCurrentRouteMs(videoStartOffset), getPlaybackSpeed(video)));
  };

  const handleMuteToggle = () => {
    if (!video) return;
    video.muted = !video.muted;
  };

  const isExpandedCls = zoom ? 'isExpanded' : '';
  const isThinCls = isThin ? 'isThin' : '';
  return (
    <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => handleJump(-10000) }
          aria-label="Jump back 10 seconds"
        >
          <Replay10 className={`${classes.icon} small dim`} />
        </IconButton>
      </div>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => handleJump(10000) }
          aria-label="Jump forward 10 seconds"
        >
          <Forward10 className={`${classes.icon} small dim`} />
        </IconButton>
      </div>
      { !isThin && (
        <Typography variant="caption" align="center" style={{ paddingTop: 4 }}>
          CURRENT PLAYBACK TIME
        </Typography>
      )}
      <PlaybackTime
        className={classes.currentTime}
        routeStartMs={currentRoute?.start_time_utc_millis}
        videoStartOffset={videoStartOffset}
      />
      {!playsHlsNatively() && <SpeedControl classes={classes} makeHandleSpeedChange={makeHandleSpeedChange} />}
      <div className={ classes.leftBorderBox }>
        <MuteButton classes={classes} hasAudio={hasAudio} onToggle={handleMuteToggle} />
      </div>
      <div className={ classes.leftBorderBox }>
        <PlayPauseButton classes={classes} onToggle={handlePauseToggle} />
      </div>
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  loop: state.loop,
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
