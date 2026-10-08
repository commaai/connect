import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { Forward10, Pause, PlayArrow, Replay10, VolumeUp, VolumeOff } from '../../icons';
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

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const QUIET = 'rgba(255, 255, 255, 0.62)';

function controlButton(color) {
  return {
    width: 40,
    height: 40,
    padding: 0,
    borderRadius: '50%',
    color,
    backgroundColor: 'transparent',
    touchAction: 'manipulation',
    transition: `transform 150ms ${EASE}, background-color 150ms ${EASE}, color 150ms ${EASE}`,
    '&:hover, &:focus': {
      backgroundColor: 'transparent',
    },
    '&:active': {
      transform: 'scale(0.97)',
    },
    '@media (hover: hover) and (pointer: fine)': {
      '&:hover': {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        color: '#fff',
      },
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: `background-color 150ms ${EASE}, color 150ms ${EASE}`,
    },
  };
}

const styles = (theme) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    height: 56,
    borderRadius: 28,
    padding: '0 8px',
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    userSelect: 'none',
    touchAction: 'manipulation',
    opacity: 0,
    pointerEvents: 'none',
    transition: `opacity 150ms ${EASE}`,
    '&.isExpanded': {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '&.isThin': {
      height: 52,
    },
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  speedLabel: {
    color: 'inherit',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  icon: {
    width: 22,
    height: 22,
    color: 'inherit',
    '&.dim': {
      color: theme.palette.grey[300],
    },
  },
  iconButton: controlButton(QUIET),
  pauseButton: controlButton('#fff'),
  currentTime: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: 'rgba(255, 255, 255, 0.92)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    minWidth: 0,
    display: 'block',
    flexGrow: 1,
    textAlign: 'center',
  },
});

class TimeDisplay extends Component {
  static getDerivedStateFromProps(props, state) {
    if (props.desiredPlaySpeed !== 0 && props.desiredPlaySpeed !== state.desiredPlaySpeed) {
      return {
        ...state,
        desiredPlaySpeed: props.desiredPlaySpeed,
      };
    }
    return state;
  }

  constructor(props) {
    super(props);

    this.textHolder = React.createRef();

    this.updateTime = this.updateTime.bind(this);
    this.togglePause = this.togglePause.bind(this);
    this.cycleSpeed = this.cycleSpeed.bind(this);
    this.jumpBack = this.jumpBack.bind(this);
    this.jumpForward = this.jumpForward.bind(this);

    this.state = {
      desiredPlaySpeed: 1,
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
    const offset = currentOffset();
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
    this.props.dispatch(seek(currentOffset() - amount));
  }

  jumpForward(amount) {
    this.props.dispatch(seek(currentOffset() + amount));
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

  cycleSpeed() {
    const { dispatch } = this.props;
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) curIndex = timerSteps.indexOf(1);
    dispatch(play(timerSteps[(curIndex + 1) % timerSteps.length]));
  }

  togglePause() {
    const { desiredPlaySpeed, dispatch } = this.props;
    if (desiredPlaySpeed === 0) {
      // eslint-disable-next-line react/destructuring-assignment
      dispatch(play(this.state.desiredPlaySpeed));
    } else {
      dispatch(pause());
    }
  }

  render() {
    const { classes, zoom, desiredPlaySpeed: videoPlaySpeed, isThin, onMuteToggle, isMuted, hasAudio } = this.props;
    const { displayTime, desiredPlaySpeed } = this.state;
    const isPaused = videoPlaySpeed === 0;
    const isExpandedCls = zoom ? 'isExpanded' : '';
    const isThinCls = isThin ? 'isThin' : '';
    return (
      <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
        <div className={classes.group}>
          <IconButton
            className={classes.iconButton}
            onClick={() => this.jumpBack(10000)}
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={classes.icon} />
          </IconButton>
          <IconButton
            className={classes.iconButton}
            onClick={() => this.jumpForward(10000)}
            aria-label="Jump forward 10 seconds"
          >
            <Forward10 className={classes.icon} />
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
          <IconButton
            className={classes.iconButton}
            onClick={this.cycleSpeed}
            aria-label={`Playback speed ${desiredPlaySpeed} times`}
          >
            <span className={classes.speedLabel}>
              {desiredPlaySpeed}
              ×
            </span>
          </IconButton>
        )}
        <div className={classes.group}>
          <Tooltip title={!this.props.hasAudio ? 'Enable audio recording through the "Record and Upload Microphone Audio" toggle on your device' : ''}>
            <div>
              <IconButton
                className={classes.iconButton}
                onClick={onMuteToggle}
                disabled={!hasAudio}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted
                  ? (<VolumeOff className={`${classes.icon} ${!hasAudio ? 'dim' : ''}`} />)
                  : (<VolumeUp className={classes.icon} />)}
              </IconButton>
            </div>
          </Tooltip>
          <IconButton
            className={classes.pauseButton}
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
  desiredPlaySpeed: state.desiredPlaySpeed,
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
