import React, { Component } from 'react';
import { connect } from 'react-redux';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import { Menu, MenuItem, Tooltip } from '@material-ui/core';

import { Forward10, Pause, PlayArrow, Replay10, VolumeUp, VolumeOff } from '../../icons';
import { currentOffset } from '../../timeline';
import { seek, play, pause } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';

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
  rightBorderBox: {
    borderRight: `1px solid ${theme.palette.grey[900]}`,
  },
  leftBorderBox: {
    borderLeft: `1px solid ${theme.palette.grey[900]}`,
  },
  currentTime: {
    margin: `0 ${theme.spacing.unit / 2}px`,
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
    this.jumpBack = this.jumpBack.bind(this);
    this.jumpForward = this.jumpForward.bind(this);

    this.state = {
      displayTime: this.getDisplayTime(),
      speedMenu: null,
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

  setSpeed(speed) {
    this.setState({ speedMenu: null });
    this.props.dispatch(play(speed));
  }

  togglePause() {
    const { isPaused, dispatch } = this.props;
    dispatch(isPaused ? play() : pause());
  }

  render() {
    const { classes, zoom, isPaused, playSpeed, isThin, onMuteToggle, isMuted, hasAudio } = this.props;
    const { displayTime, speedMenu } = this.state;
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
        <button
          type="button"
          onClick={(ev) => this.setState({ speedMenu: ev.currentTarget })}
          aria-label="Play speed"
          aria-haspopup="true"
          className="mr-1 h-8 min-w-10 rounded-full bg-white/10 px-2 text-sm font-semibold text-white tabular-nums cursor-pointer"
        >
          {`${playSpeed}×`}
        </button>
        <Menu open={Boolean(speedMenu)} anchorEl={speedMenu} onClose={() => this.setState({ speedMenu: null })}>
          {timerSteps.map((speed) => (
            <MenuItem key={speed} selected={speed === playSpeed} onClick={() => this.setSpeed(speed)}>
              {`${speed}×`}
            </MenuItem>
          ))}
        </Menu>
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
  isPaused: state.isPaused,
  playSpeed: state.playSpeed,
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
