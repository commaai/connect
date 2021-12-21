import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import fecha from 'fecha';
import PropTypes from 'prop-types';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Pause from '@material-ui/icons/Pause';

import { DownArrow, UpArrow, HistoryForwardIcon, HistoryBackIcon } from '../../icons';
import { seek, play, pause, currentOffset } from '../../timeline/playback';

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
    flexGrow: 1,
  }
});

class TimeDisplay extends Component {
  static getDerivedStateFromProps(props, state) {
    if (props.desiredPlaySpeed !== 0 && props.desiredPlaySpeed !== state.desiredPlaySpeed) {
      return {
        ...state,
        desiredPlaySpeed: props.desiredPlaySpeed
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
    this.jumpBack = this.jumpBack.bind(this);
    this.jumpForward = this.jumpForward.bind(this);
    this.segmentNum = this.segmentNum.bind(this);

    this.state = {
      desiredPlaySpeed: 1,
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

  jumpBack(amount) {
    this.props.dispatch(seek(currentOffset() - amount));
  }

  jumpForward(amount) {
    this.props.dispatch(seek(currentOffset() + amount));
  }

  getDisplayTime() {
    const offset = currentOffset();
    const { filter } = this.props;
    if (!Number.isFinite(filter.start)) {
      return '...';
    }
    const now = new Date(offset + filter.start);
    let dateString = fecha.format(now, 'HH:mm:ss');
    const seg = this.segmentNum(offset);
    if (seg !== null) {
      dateString = `${dateString} \u2013 ${seg}`;
    }

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
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    this.props.dispatch(play(timerSteps[curIndex]));
  }

  increaseSpeed() {
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    this.props.dispatch(play(timerSteps[curIndex]));
  }

  togglePause(e) {
    const { desiredPlaySpeed } = this.props;
    if (desiredPlaySpeed === 0) {
      this.props.dispatch(play(this.state.desiredPlaySpeed));
    } else {
      this.props.dispatch(pause());
    }
  }

  segmentNum(offset) {
    const { currentSegment } = this.props;
    if (currentSegment && currentSegment.routeOffset <= offset &&
      currentSegment.routeOffset + currentSegment.duration >= offset)
    {
      return Math.floor((offset - currentSegment.routeOffset) / 60000);
    }
    return null;
  }

  render() {
    const { classes } = this.props;
    const isPaused = this.props.desiredPlaySpeed === 0;
    const isExpandedCls = this.props.expanded ? 'isExpanded' : '';
    const isThinCls = this.props.isThin ? 'isThin' : '';
    return (
      <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
        <div className={ classes.iconBox }>
          <IconButton className={ classes.iconButton } onClick={ () => this.jumpBack(10000) }
            aria-label="Jump back 10 seconds">
            <HistoryBackIcon className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        <div className={ classes.iconBox }>
          <IconButton className={ classes.iconButton } onClick={ () => this.jumpForward(10000) }
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
        <div className={ classes.desiredPlaySpeedContainer }>
          <IconButton className={classes.tinyArrowIcon} onClick={this.increaseSpeed}
            aria-label="Increase play speed by 1 step">
            <UpArrow className={classes.tinyArrowIcon} />
          </IconButton>
          <Typography variant="body2" align="center">
            { this.state.desiredPlaySpeed }×
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

const stateToProps = Obstruction({
  currentSegment: 'currentSegment',
  expanded: 'zoom.expanded',
  desiredPlaySpeed: 'desiredPlaySpeed',
  filter: 'filter',
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
