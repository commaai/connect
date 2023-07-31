import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import dayjs from 'dayjs';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';

import { DownArrow, Forward10, Pause, PlayArrow, Replay10, UpArrow } from '../../icons';
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
  iconBox: {
    borderRight: `1px solid ${theme.palette.grey[900]}`,
  },
  playButtonBox: {
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
    this.increaseSpeed = this.increaseSpeed.bind(this);
    this.decreaseSpeed = this.decreaseSpeed.bind(this);
    this.jumpBack = this.jumpBack.bind(this);
    this.jumpForward = this.jumpForward.bind(this);

    this.state = {
      desiredPlaySpeed: 1,
      displayTime: this.getDisplayTime(),
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
    const offset = currentOffset();
    const { filter, currentRoute } = this.props;
    const now = new Date(offset + filter.start);
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

    raf(this.updateTime);
  }

  decreaseSpeed() {
    const { dispatch } = this.props;
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    dispatch(play(timerSteps[curIndex]));
  }

  canDecreaseSpeed() {
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex > 0;
  }

  increaseSpeed() {
    const { dispatch } = this.props;
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    dispatch(play(timerSteps[curIndex]));
  }

  canIncreaseSpeed() {
    const { desiredPlaySpeed } = this.state;
    let curIndex = timerSteps.indexOf(desiredPlaySpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    return curIndex < timerSteps.length - 1;
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
    const { classes, zoom, desiredPlaySpeed: videoPlaySpeed, isThin } = this.props;
    const { displayTime, desiredPlaySpeed } = this.state;
    const isPaused = videoPlaySpeed === 0;
    const isExpandedCls = zoom ? 'isExpanded' : '';
    const isThinCls = isThin ? 'isThin' : '';
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    return (
      <div className={ `${classes.base} ${isExpandedCls} ${isThinCls}` }>
        <div className={ classes.iconBox }>
          <IconButton
            className={ classes.iconButton }
            onClick={ () => this.jumpBack(10000) }
            aria-label="Jump back 10 seconds"
          >
            <Replay10 className={`${classes.icon} small dim`} />
          </IconButton>
        </div>
        <div className={ classes.iconBox }>
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
        {!isIos && (
          <div className={ classes.desiredPlaySpeedContainer }>
            <IconButton
              className={classes.tinyArrowIcon}
              onClick={this.increaseSpeed}
              disabled={!this.canIncreaseSpeed()}
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
              onClick={this.decreaseSpeed}
              disabled={!this.canDecreaseSpeed()}
              aria-label="Decrease play speed by 1 step"
            >
              <DownArrow className={classes.tinyArrowIcon} />
            </IconButton>
          </div>
        )}
        <div className={ classes.playButtonBox }>
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

const stateToProps = Obstruction({
  currentRoute: 'currentRoute',
  zoom: 'zoom',
  desiredPlaySpeed: 'desiredPlaySpeed',
  filter: 'filter',
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
