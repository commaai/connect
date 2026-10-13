import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { seekBy, play, pause, setPlaybackSpeed } from '../../timeline/playback';
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

function getDisplayTime(currentRoute, offset) {
  const now = new Date(offset + currentRoute.start_time_utc_millis);
  if (Number.isNaN(now.getTime())) {
    return '...';
  }
  let dateString = dayjs(now).format('HH:mm:ss');
  const seg = getSegmentNumber(currentRoute, offset);
  if (seg !== null) {
    dateString = `${dateString} \u2013 ${seg}`;
  }

  return dateString;
}

class TimeDisplay extends Component {
  render() {
    const {
      classes, zoom, currentRoute, second, desiredPlaySpeed, isPlaying, isThin, onMuteToggle, isMuted, hasAudio, dispatch,
    } = this.props;
    const displayTime = getDisplayTime(currentRoute, second * 1000);
    const faster = timerSteps.find((speed) => speed > desiredPlaySpeed);
    const slower = timerSteps.filter((speed) => speed < desiredPlaySpeed).pop();
    const isExpandedCls = zoom ? 'isExpanded' : '';
    const isThinCls = isThin ? 'isThin' : '';
    return (
      <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
        <div className={ classes.rightBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => dispatch(seekBy(-10000)) }
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        <div className={ classes.rightBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => dispatch(seekBy(10000)) }
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
          { displayTime }
        </Typography>
        {!isIos() && (
          <div className={ classes.desiredPlaySpeedContainer }>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={() => dispatch(setPlaybackSpeed(faster))}
              disabled={!faster}
              aria-label="Increase play speed by 1 step"
            >
              <UpArrow className={classes.tinyArrowIcon} />
            </IconButton>
            <Typography variant="body2" align="center" className={classes.desiredPlaySpeed}>
              {desiredPlaySpeed}
              ×
            </Typography>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={() => dispatch(setPlaybackSpeed(slower))}
              disabled={!slower}
              aria-label="Decrease play speed by 1 step"
            >
              <DownArrow className={classes.tinyArrowIcon} />
            </IconButton>
          </div>
        )}
        <div className={ classes.leftBorderBox }>
          <Tooltip title={ !this.props.hasAudio ? "Enable audio recording through the \"Record and Upload Microphone Audio\" toggle on your device" : '' }>
            <div>
              <IconButton
                className={ classes.iconButton }
                onClick={onMuteToggle}
                disabled={!hasAudio}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted
                  ? (<VolumeOff className={`${classes.icon} small ${!hasAudio ? 'dim' : ''}`} />)
                  : (<VolumeUp className={`${classes.icon} small`} />)}
              </IconButton>
            </div>
          </Tooltip>
        </div>
        <div className={ classes.leftBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={() => dispatch(isPlaying ? pause() : play())}
            aria-label={isPlaying ? 'Pause' : 'Unpause'}
          >
            {isPlaying
              ? (<Pause className={classes.icon} />)
              : (<PlayArrow className={classes.icon} />)}
          </IconButton>
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  zoom: state.zoom,
  desiredPlaySpeed: state.desiredPlaySpeed,
  isPlaying: state.isPlaying,
  currentRoute: state.currentRoute,
  second: Math.floor(state.offset / 1000),
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
