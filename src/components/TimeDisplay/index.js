import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import fecha from 'fecha';
import { partial } from 'ap';
import cx from 'classnames';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Pause from '@material-ui/icons/Pause';

import {
  DownArrow, UpArrow, HistoryForwardIcon, HistoryBackIcon
} from '../../icons';

import TimelineWorker from '../../timeline';

const timerSteps = [
  0.1,
  0.25,
  0.5,
  1,
  2,
  3,
  4,
  5
];

function jumpBack(amount) {
  TimelineWorker.seek(TimelineWorker.currentOffset() - amount);
}

function jumpForward(amount) {
  TimelineWorker.seek(TimelineWorker.currentOffset() + amount);
}
const styles = (theme) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: theme.palette.grey[999],
    height: '64px',
    borderRadius: '32px',
    padding: theme.spacing.unit,
    width: 'max-content',
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
  },
  icon: {
    width: '98%',
    height: '98%',
    '&.dim': {
      color: theme.palette.grey[700]
    },
    '&.small': {
      width: '60%',
      height: '60%',
    },
    '&.circle': {
      border: `1px solid ${theme.palette.grey[900]}`,
      borderRadius: '50%'
    }
  },
  tinyArrowIcon: {
    width: 12,
    height: 12,
    color: theme.palette.grey[700]
  },
  iconBox: {
    borderRight: `1px solid ${theme.palette.grey[900]}`
  },
  playButtonBox: {
    borderLeft: `1px solid ${theme.palette.grey[900]}`
  },
  currentTime: {
    margin: `0 ${theme.spacing.unit * 1}px`,
    fontSize: 15,
    fontWeight: 500,
    display: 'block',
  }
});

class TimeDisplay extends Component {
  static getDerivedStateFromProps(props, state) {
    if (props.playSpeed !== 0 && props.playSpeed !== state.playSpeed) {
      return {
        ...state,
        playSpeed: props.playSpeed
      };
    }
    return state;
  }

  constructor(props) {
    super(props);

    this.textHolder = React.createRef();

    this.updateTime = this.updateTime.bind(this);
    this.togglePause = this.togglePause.bind(this);
    this.increaseSpeed = this.increaseSpeed.bind(this);
    this.decreaseSpeed = this.decreaseSpeed.bind(this);

    this.state = {
      playSpeed: 1,
      displayTime: this.getDisplayTime()
    };
  }

  componentDidMount() {
    this.mounted = true;
    raf(this.updateTime);
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  getDisplayTime() {
    const currentOffset = TimelineWorker.currentOffset();
    const { start } = this.props;
    if (!Number.isFinite(start)) {
      return '...';
    }
    const now = new Date(currentOffset + start);
    const dateString = fecha.format(now, 'ddd, D MMM, YYYY @ HH:mm:ss');
    // var dateString = fecha.format(now, 'MMM D @ HH:mm:ss');

    return dateString;
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

    raf(this.updateTime);
  }

  decreaseSpeed() {
    const { playSpeed } = this.state;
    let curIndex = timerSteps.indexOf(playSpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    TimelineWorker.play(timerSteps[curIndex]);
  }

  increaseSpeed() {
    const { playSpeed } = this.state;
    let curIndex = timerSteps.indexOf(playSpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    TimelineWorker.play(timerSteps[curIndex]);
  }

  togglePause(e) {
    const { playSpeed } = this.props;
    if (playSpeed === 0) {
      TimelineWorker.play(this.state.playSpeed);
    } else {
      TimelineWorker.pause();
    }
  }

  render() {
    const { classes } = this.props;
    const isPaused = this.props.playSpeed === 0;
    return (
      <div className={cx(classes.base, { isExpanded: this.props.expanded, isThin: this.props.isThin })}>
        <div className={ classes.iconBox }>
          <IconButton className={ classes.iconButton } onClick={partial(jumpBack, 10000)}
            aria-label="Jump back 10 seconds">
            <HistoryBackIcon className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        <div className={ classes.iconBox }>
          <IconButton className={ classes.iconButton } onClick={partial(jumpForward, 10000)}
            aria-label="Jump forward 10 seconds">
            <HistoryForwardIcon className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        { !this.props.isThin && (
          <Typography variant="caption" align="center" style={{ paddingTop: 4 }}>
            CURRENT PLAYBACK TIME
          </Typography>
        )}
        <Typography variant="body1" align="center" className={classes.currentTime}>
          <span ref={this.textHolder}>{ this.state.displayTime }</span>
        </Typography>
        <div className={ classes.playSpeedContainer }>
          <IconButton className={classes.tinyArrowIcon} onClick={this.increaseSpeed}
            aria-label="Increase play speed by 1 step">
            <UpArrow className={classes.tinyArrowIcon} />
          </IconButton>
          <Typography variant="body2" align="center">
            { this.state.playSpeed }×
          </Typography>
          <IconButton className={classes.tinyArrowIcon} onClick={this.decreaseSpeed}
            aria-label="Decrease play speed by 1 step">
            <DownArrow className={classes.tinyArrowIcon} />
          </IconButton>
        </div>
        <div className={ classes.playButtonBox }>
          <IconButton className={ classes.iconButton } onClick={this.togglePause}
            aria-label={isPaused ? 'Unpause' : 'Pause'}>
            { isPaused
              ? (<PlayArrow className={`${classes.icon}`} />)
              : (<Pause className={`${classes.icon}`} />)}
          </IconButton>
        </div>
      </div>
    );
  }
}

TimeDisplay.propTypes = {
  classes: PropTypes.object.isRequired,
  playSpeed: PropTypes.number.isRequired,
  start: PropTypes.number.isRequired
};

const stateToProps = Obstruction({
  expanded: 'zoom.expanded',
  playSpeed: 'workerState.desiredPlaySpeed',
  start: 'workerState.start',
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
