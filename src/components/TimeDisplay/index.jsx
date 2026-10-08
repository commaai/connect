import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow, VolumeUp, VolumeOff } from '../../icons';
import { getPlayheadMs, play, pause, seek, setSpeed } from '../../timeline/playback';
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
  playSpeedContainer: {
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
  constructor(props) {
    super(props);

    this.textHolder = React.createRef();

    this.updateTime = this.updateTime.bind(this);
    this.togglePause = this.togglePause.bind(this);
    this.increaseSpeed = this.increaseSpeed.bind(this);
    this.decreaseSpeed = this.decreaseSpeed.bind(this);
    this.jumpBack = this.jumpBack.bind(this);
    this.jumpForward = this.jumpForward.bind(this);

    this.state = {
      displayTime: this.getDisplayTime(),
    };
  }

  componentDidMount() {
    this.mounted = true;
    requestAnimationFrame(this.updateTime);
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  getDisplayTime() {
    const offset = getPlayheadMs();
    const { currentRoute } = this.props;
    const now = new Date(offset + currentRoute.start_time_utc_millis);
    if (Number.isNaN(now.getTime())) {
      return '...';
    }
    let dateString = dayjs(now).format('HH:mm:ss');
    const seg = getSegmentNumber(currentRoute);
    if (seg !== null) {
      dateString = `${dateString} \u2013 ${seg}`;
    }

    return dateString;
  }

  jumpBack(amount) {
    seek(getPlayheadMs() - amount);
  }

  jumpForward(amount) {
    seek(getPlayheadMs() + amount);
  }

  updateTime() {
    if (!this.mounted || !this.textHolder.current) {
      return;
    }
    const newDisplayTime = this.getDisplayTime();
    const { displayTime } = this.state;
    if (newDisplayTime !== displayTime) {
      this.setState({ displayTime: newDisplayTime });
    }

    requestAnimationFrame(this.updateTime);
  }

  decreaseSpeed() {
    const { speed } = this.props.playback;
    let curIndex = timerSteps.indexOf(speed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    setSpeed(timerSteps[curIndex]);
  }

  canDecreaseSpeed() {
    const { speed } = this.props.playback;
    let curIndex = timerSteps.indexOf(speed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex > 0;
  }

  increaseSpeed() {
    const { speed } = this.props.playback;
    let curIndex = timerSteps.indexOf(speed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    setSpeed(timerSteps[curIndex]);
  }

  canIncreaseSpeed() {
    const { speed } = this.props.playback;
    let curIndex = timerSteps.indexOf(speed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex < timerSteps.length - 1;
  }

  togglePause() {
    if (this.props.playback.playing) {
      pause();
    } else {
      play();
    }
  }

  render() {
    const { classes, zoom, playback, isThin, onMuteToggle, isMuted, hasAudio } = this.props;
    const { displayTime } = this.state;
    const isPaused = !playback.playing;
    const isExpandedCls = zoom ? 'isExpanded' : '';
    const isThinCls = isThin ? 'isThin' : '';
    return (
      <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
        <div className={ classes.rightBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => this.jumpBack(10000) }
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        <div className={ classes.rightBorderBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => this.jumpForward(10000) }
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
          <span ref={this.textHolder}>{ displayTime }</span>
        </Typography>
        {!isIos() && (
          <div className={ classes.playSpeedContainer }>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={this.increaseSpeed}
              disabled={!this.canIncreaseSpeed()}
              aria-label="Increase play speed by 1 step"
            >
              <UpArrow className={classes.tinyArrowIcon} />
            </IconButton>
            <Typography variant="body2" align="center">
              {playback.speed}
              ×
            </Typography>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={this.decreaseSpeed}
              disabled={!this.canDecreaseSpeed()}
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
            onClick={this.togglePause}
            aria-label={isPaused ? 'Unpause' : 'Pause'}
          >
            {isPaused
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
  playback: state.playback,
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
