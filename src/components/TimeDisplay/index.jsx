import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Tooltip } from '@material-ui/core';

import { Forward10, Pause, PlayArrow, Replay10, VolumeUp, VolumeOff } from '../../icons';
import { currentOffset, subscribePlaybackFrames } from '../../timeline';
import { seek, play, pause } from '../../timeline/playback';
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
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: theme.palette.grey[999],
    border: '1px solid rgba(255,255,255,0.08)',
    boxSizing: 'border-box',
    height: '64px',
    borderRadius: '32px',
    padding: theme.spacing.unit,
    width: 460,
    maxWidth: '100%',
    margin: '0 auto',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.1s ease-in-out',
    '& button:focus-visible': {
      outline: '2px solid rgba(255,255,255,0.55)',
      outlineOffset: 2,
    },
    '&.isExpanded': {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '&.isThin': {
      height: 52,
      paddingBottom: 3,
      paddingTop: 3,
    },
    '@media (max-width: 480px)': {
      paddingLeft: 4,
      paddingRight: 4,
      gap: '2px',
    },
  },
  timeColumn: {
    minWidth: 0,
    paddingLeft: 8,
  },
  transport: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 2,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    '@media (max-width: 360px)': { gap: '1px', padding: 1 },
  },
  icon: {
    '&&': { width: 22, height: 22 },
  },
  iconButton: {
    '&&': {
      width: 36,
      height: 36,
      padding: 6,
      '@media (max-width: 360px)': { width: 32, height: 32, padding: 4 },
    },
  },
  playButton: {
    '&&': {
      width: 40,
      height: 40,
      color: theme.palette.common.white,
      backgroundColor: 'rgba(255,255,255,0.08)',
      '&:hover': { backgroundColor: 'rgba(255,255,255,0.14)' },
      '@media (max-width: 360px)': { width: 36, height: 36 },
    },
  },
  options: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '2px',
    minWidth: 0,
  },
  speedButton: {
    '&&': {
      width: 46,
      minWidth: 46,
      height: 36,
      padding: 4,
      borderRadius: 18,
      fontSize: 13,
      fontWeight: 600,
      '@media (max-width: 360px)': { width: 40, minWidth: 40, height: 32, padding: 2, fontSize: 12 },
    },
  },
  timeCaption: {
    fontSize: 9,
    letterSpacing: 0.5,
    opacity: 0.5,
  },
  currentTime: {
    fontSize: 12,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
    this.unsubscribePlayback = subscribePlaybackFrames(this.updateTime);
  }

  componentWillUnmount() {
    this.mounted = false;
    this.unsubscribePlayback?.();
  }

  getDisplayTime() {
    const offset = currentOffset();
    const { currentRoute } = this.props;
    const now = new Date(offset + currentRoute.start_time_utc_millis);
    if (Number.isNaN(now.getTime())) {
      return '...';
    }
    return dayjs(now).format('HH:mm:ss');
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
  }

  cycleSpeed() {
    const speed = timerSteps.find((step) => step > this.state.desiredPlaySpeed) ?? timerSteps[0];
    if (this.props.desiredPlaySpeed === 0) {
      this.setState({ desiredPlaySpeed: speed });
    } else {
      this.props.dispatch(play(speed));
    }
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
        <div className={classes.timeColumn}>
          {!isThin && <Typography variant="caption" className={classes.timeCaption}>CURRENT TIME</Typography>}
          <Typography variant="body1" className={classes.currentTime}>
            <span ref={this.textHolder} aria-label="Current playback time">{displayTime}</span>
          </Typography>
        </div>
        <div role="group" aria-label="Playback transport" className={classes.transport}>
          <IconButton
            className={classes.iconButton}
            onClick={ () => this.jumpBack(10000) }
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={classes.icon} />
          </IconButton>
          <IconButton
            className={`${classes.iconButton} ${classes.playButton}`}
            onClick={this.togglePause}
            aria-label={isPaused ? 'Play' : 'Pause'}
          >
            {isPaused ? <PlayArrow className={classes.icon} /> : <Pause className={classes.icon} />}
          </IconButton>
          <IconButton
            className={classes.iconButton}
            onClick={ () => this.jumpForward(10000) }
            aria-label="Jump forward 10 seconds"
          >
            <Forward10 className={classes.icon} />
          </IconButton>
        </div>
        <div className={classes.options}>
          {!isIos() && (
            <IconButton
              className={classes.speedButton}
              onClick={this.cycleSpeed}
              aria-label={`Playback speed, current ${desiredPlaySpeed}x`}
            >
              {desiredPlaySpeed}×
            </IconButton>
          )}
          <Tooltip title={ !hasAudio ? "Enable audio recording through the \"Record and Upload Microphone Audio\" toggle on your device" : '' }>
            <div>
              <IconButton
                className={ classes.iconButton }
                onClick={onMuteToggle}
                disabled={!hasAudio}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted
                  ? (<VolumeOff className={classes.icon} />)
                  : (<VolumeUp className={classes.icon} />)}
              </IconButton>
            </div>
          </Tooltip>
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
