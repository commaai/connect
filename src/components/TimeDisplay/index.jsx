import React, { useCallback, useRef } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { useVideo, useVideoControls, useVideoFrame } from '../../hooks/video';
import { getCurrentRouteMs, seekToRouteMs, toRouteMs } from '../../timeline/routeTime';
import { videoPaused, videoPlayed, videoSeeked } from '../../timeline/playback';
import { getPlaybackSpeed, playIgnoringInterruptions } from '../../timeline/video';
import { segmentAtOffset } from '../../utils';
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
    height: '64px',
    borderRadius: '32px',
    padding: theme.spacing.unit,
    width: 400,
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
      height: 50,
      paddingBottom: 0,
      paddingTop: 0,
    },
  },
  desiredPlaySpeedContainer: {
    marginRight: theme.spacing.unit * 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '40px',
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
    width: '40px',
    height: '40px',
  },
  tinyArrowIcon: {
    width: 12,
    height: 12,
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
  currentTime: {
    margin: `0 ${theme.spacing.unit * 1}px`,
    fontSize: 15,
    fontWeight: 500,
    display: 'block',
    flexGrow: 1,
  },
});

function formatPlaybackTime(routeStartMillis, routeMs) {
  const now = new Date(routeMs + routeStartMillis);
  if (Number.isNaN(now.getTime())) {
    return '...';
  }
  const time = dayjs(now).format('HH:mm:ss');
  return `${time} \u2013 ${segmentAtOffset(routeMs)}`;
}

function speedStepIndex(playbackRate) {
  const index = timerSteps.indexOf(playbackRate);
  if (index === -1) {
    return timerSteps.indexOf(1);
  }
  return index;
}

function usePlaybackTimeText(routeStartMillis, videoStartOffset) {
  const textRef = useRef(null);

  const updateText = useCallback((videoSeconds) => {
    const node = textRef.current;
    if (!node) {
      return;
    }
    const text = formatPlaybackTime(routeStartMillis, toRouteMs(videoStartOffset, videoSeconds));
    if (node.textContent === text) {
      return;
    }
    node.textContent = text;
  }, [routeStartMillis, videoStartOffset]);

  useVideoFrame(updateText);
  return textRef;
}

function TimeDisplay({ classes, dispatch, currentRoute, loop, zoom, isThin, hasAudio }) {
  const video = useVideo();
  const { paused, playbackRate, muted } = useVideoControls();
  const videoStartOffset = currentRoute?.videoStartOffset;
  const timeTextRef = usePlaybackTimeText(currentRoute?.start_time_utc_millis, videoStartOffset);

  const speedIndex = speedStepIndex(playbackRate);
  const canIncreaseSpeed = speedIndex < timerSteps.length - 1;
  const canDecreaseSpeed = speedIndex > 0;

  const jumpBy = (amount) => {
    if (!video) {
      return;
    }
    const targetMs = seekToRouteMs(video, videoStartOffset, getCurrentRouteMs(videoStartOffset) + amount, loop);
    dispatch(videoSeeked(targetMs, getPlaybackSpeed(video)));
  };

  const play = () => {
    playIgnoringInterruptions(video);
    dispatch(videoPlayed(getCurrentRouteMs(videoStartOffset), getPlaybackSpeed(video)));
  };

  const changeSpeedBy = (steps) => {
    if (!video) {
      return;
    }
    video.playbackRate = timerSteps[speedIndex + steps];
    play();
  };

  const togglePause = () => {
    if (!video) {
      return;
    }
    if (paused) {
      play();
      return;
    }
    video.pause();
    dispatch(videoPaused(getCurrentRouteMs(videoStartOffset), getPlaybackSpeed(video)));
  };

  const toggleMute = () => {
    if (!video) {
      return;
    }
    video.muted = !muted;
  };

  const isExpandedCls = zoom ? 'isExpanded' : '';
  const isThinCls = isThin ? 'isThin' : '';
  return (
    <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => jumpBy(-10000) }
          aria-label="Jump back 10 seconds"
        >
          <Replay10 className={`${classes.icon} small dim`} />
        </IconButton>
      </div>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => jumpBy(10000) }
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
      <Typography variant="body1" align="center" className={classes.currentTime}>
        <span ref={timeTextRef} />
      </Typography>
      {!playsHlsNatively() && (
        <div className={ classes.desiredPlaySpeedContainer }>
          <IconButton
            className={classes.tinyArrowIcon}
            onClick={() => changeSpeedBy(1)}
            disabled={!canIncreaseSpeed}
            aria-label="Increase play speed by 1 step"
          >
            <UpArrow className={classes.tinyArrowIcon} />
          </IconButton>
          <Typography variant="body2" align="center">
            {playbackRate}
            ×
          </Typography>
          <IconButton
            className={classes.tinyArrowIcon}
            onClick={() => changeSpeedBy(-1)}
            disabled={!canDecreaseSpeed}
            aria-label="Decrease play speed by 1 step"
          >
            <DownArrow className={classes.tinyArrowIcon} />
          </IconButton>
        </div>
      )}
      <div className={ classes.leftBorderBox }>
        <Tooltip title={ !hasAudio ? "Enable audio recording through the \"Record and Upload Microphone Audio\" toggle on your device" : '' }>
          <div>
            <IconButton
              className={ classes.iconButton }
              onClick={toggleMute}
              disabled={!hasAudio}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted
                ? (<VolumeOff className={`${classes.icon} small ${!hasAudio ? 'dim' : ''}`} />)
                : (<VolumeUp className={`${classes.icon} small`} />)}
            </IconButton>
          </div>
        </Tooltip>
      </div>
      <div className={ classes.leftBorderBox }>
        <IconButton
          onClick={togglePause}
          aria-label={paused ? 'Unpause' : 'Pause'}
        >
          {paused
            ? (<PlayArrow className={classes.icon} />)
            : (<Pause className={classes.icon} />)}
        </IconButton>
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
