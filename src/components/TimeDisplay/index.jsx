import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import VolumeUp from '@material-ui/icons/VolumeUp';
import VolumeOff from '@material-ui/icons/VolumeOff';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow } from '../../icons';
import { VideoStatus, seek, play, pause, setPlaybackSpeed } from '../../timeline/playback';
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

class TimeDisplay extends Component {
  getDisplayTime() {
    const { currentRoute, offset } = this.props;
    const now = new Date(offset + currentRoute?.start_time_utc_millis);
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

  changeSpeed(direction) {
    const { dispatch, desiredPlaySpeed } = this.props;
    dispatch(setPlaybackSpeed(timerSteps[timerSteps.indexOf(desiredPlaySpeed) + direction]));
  }

  render() {
    const {
      classes, zoom, isThin, onMuteToggle, isMuted, hasAudio, desiredPlaySpeed, isPlaying, videoStatus, dispatch, offset,
    } = this.props;
    const speedIndex = timerSteps.indexOf(desiredPlaySpeed);
    const isExpandedCls = zoom ? 'isExpanded' : '';
    const isThinCls = isThin ? 'isThin' : '';
    const controlsDisabled = videoStatus === VideoStatus.FAILED;
    return (
      <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
        <div className={ classes.rightBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => dispatch(seek(offset - 10000)) }
            disabled={controlsDisabled}
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        <div className={ classes.rightBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => dispatch(seek(offset + 10000)) }
            disabled={controlsDisabled}
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
          {this.getDisplayTime()}
        </Typography>
        {!isIos() && (
          <div className={ classes.desiredPlaySpeedContainer }>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={() => this.changeSpeed(1)}
              disabled={controlsDisabled || speedIndex >= timerSteps.length - 1}
              aria-label="Increase play speed by 1 step"
            >
              <UpArrow className={classes.tinyArrowIcon} />
            </IconButton>
            <Typography variant="body2" align="center">
              {desiredPlaySpeed}
              ×
            </Typography>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={() => this.changeSpeed(-1)}
              disabled={controlsDisabled || speedIndex <= 0}
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
                disabled={controlsDisabled || !hasAudio}
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
            onClick={() => dispatch(isPlaying ? pause() : play())}
            disabled={controlsDisabled}
            aria-label={!isPlaying ? 'Unpause' : 'Pause'}
          >
            {!isPlaying
              ? (<PlayArrow className={classes.icon} />)
              : (<Pause className={classes.icon} />)}
          </IconButton>
        </div>
      </div>
    );
  }
}

const stateToProps = (state) => ({
  currentRoute: state.currentRoute,
  zoom: state.zoom,
  desiredPlaySpeed: state.desiredPlaySpeed,
  isPlaying: state.isPlaying,
  offset: state.offset,
  videoStatus: state.videoStatus,
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
