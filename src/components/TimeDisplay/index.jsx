import React, { useState } from 'react';
import useAnimationFrame from '../../hooks/useAnimationFrame';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, play, pause } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';
import { isIos } from '../../utils/browser.js';

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
    width: '2.75em',
    height: '2.75em',
  },
  speedButton: { width: 32, height: 24, padding: 4 },
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

function displayTimeFor(props) {
  const offset = currentOffset(props);
  const now = new Date(offset + props.currentRoute.start_time_utc_millis);
  if (Number.isNaN(now.getTime())) return '...';
  const time = dayjs(now).format('HH:mm:ss');
  const segment = getSegmentNumber(props.currentRoute, offset);
  return segment === null ? time : `${time} – ${segment}`;
}

function TimeDisplay(props) {
  const { classes, zoom, isPaused, playSpeed, isThin, onMuteToggle, isMuted, hasAudio, dispatch } = props;
  const [displayTime, setDisplayTime] = useState(() => displayTimeFor(props));
  useAnimationFrame(() => {
    const time = displayTimeFor(props);
    if (time !== displayTime) setDisplayTime(time);
  });
  const speedIndex = Math.max(0, timerSteps.indexOf(playSpeed) === -1 ? timerSteps.indexOf(1) : timerSteps.indexOf(playSpeed));
  const stepSpeed = (direction) => dispatch(play(timerSteps[Math.max(0, Math.min(timerSteps.length - 1, speedIndex + direction))]));

  return (
    <div className={`${classes.base} ${zoom ? 'isExpanded' : ''} ${isThin ? 'isThin' : ''}`}>
      {[[-10000, Replay10, 'back'], [10000, Forward10, 'forward']].map(([amount, Icon, direction]) => (
        <div key={direction} className={classes.rightBorderBox}>
          <IconButton className={classes.iconButton} aria-label={`Jump ${direction} 10 seconds`}
            onClick={() => dispatch(seek(currentOffset(props) + amount))}>
            <Icon className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
      ))}
      {!isThin && <Typography variant="caption" align="center" style={{ paddingTop: 4 }}>CURRENT PLAYBACK TIME</Typography>}
      <Typography variant="body1" align="center" className={classes.currentTime}>{displayTime}</Typography>
      {!isIos() && (
        <div className={classes.desiredPlaySpeedContainer}>
          {[[1, UpArrow, 'Increase'], [-1, DownArrow, 'Decrease']].map(([direction, Icon, label]) => (
            <React.Fragment key={label}>
              {direction === -1 && <Typography variant="body2" align="center" className={classes.desiredPlaySpeed}>{playSpeed}×</Typography>}
              <IconButton className={classes.speedButton} onClick={() => stepSpeed(direction)}
                disabled={direction === 1 ? speedIndex === timerSteps.length - 1 : speedIndex === 0}
                aria-label={`${label} play speed by 1 step`}>
                <Icon className={classes.tinyArrowIcon} />
              </IconButton>
            </React.Fragment>
          ))}
        </div>
      )}
      <div className={classes.leftBorderBox}>
        <Tooltip title={hasAudio === false ? 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device' : ''}>
          <div>
            <IconButton className={classes.iconButton} onClick={onMuteToggle} disabled={hasAudio === false}
              aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <VolumeOff className={`${classes.icon} small ${!hasAudio ? 'dim' : ''}`} />
                : <VolumeUp className={`${classes.icon} small`} />}
            </IconButton>
          </div>
        </Tooltip>
      </div>
      <div className={classes.leftBorderBox}>
        <IconButton className={classes.iconButton} onClick={() => dispatch(isPaused ? play(playSpeed) : pause())}
          aria-label={isPaused ? 'Unpause' : 'Pause'}>
          {isPaused ? <PlayArrow className={classes.icon} /> : <Pause className={classes.icon} />}
        </IconButton>
      </div>
    </div>
  );
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  loop: state.loop,
  offset: state.offset,
  isPaused: state.isPaused,
  playSpeed: state.playSpeed,
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
