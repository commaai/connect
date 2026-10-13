import React, { useSyncExternalStore } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { seek, play, pause } from '../../timeline/playback';
import { media } from '../../timeline/media';
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

function displayTime(currentRoute, routeTime) {
  const now = new Date(routeTime + currentRoute.start_time_utc_millis);
  if (Number.isNaN(now.getTime())) return '...';
  return `${dayjs(now).format('HH:mm:ss')} \u2013 ${getSegmentNumber(currentRoute, routeTime)}`;
}

function TimeDisplay({ classes, currentRoute, dispatch, zoom, isThin }) {
  const { hasAudio, muted, paused, playbackRate, routeTime } = useSyncExternalStore(media.subscribe, media.getSnapshot);
  const index = timerSteps.indexOf(playbackRate);
  const isExpandedCls = zoom ? 'isExpanded' : '';
  const isThinCls = isThin ? 'isThin' : '';

  const jump = (amount) => dispatch(seek(media.currentOffset() + amount));
  const togglePause = () => dispatch(paused ? play() : pause());
  const changeSpeed = (direction) => dispatch(play(timerSteps[index + direction]));

  return (
    <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => jump(-10000) }
          aria-label="Jump back 10 seconds"
        >
          <Replay10 className={`${classes.icon} small dim`} />
        </IconButton>
      </div>
      <div className={ classes.rightBorderBox }>
        <IconButton
          className={ classes.iconButton }
          onClick={ () => jump(10000) }
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
        {displayTime(currentRoute, routeTime)}
      </Typography>
      {!isIos() && (
        <div className={ classes.desiredPlaySpeedContainer }>
          <IconButton
            className={classes.tinyArrowIcon}
            onClick={() => changeSpeed(1)}
            disabled={index >= timerSteps.length - 1}
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
            onClick={() => changeSpeed(-1)}
            disabled={index <= 0}
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
              onClick={() => media.toggleMuted()}
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
          className={ classes.iconButton }
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
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
