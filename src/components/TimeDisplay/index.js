import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import fecha from 'fecha';
import { partial } from 'ap';
import cx from 'classnames';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Pause from '@material-ui/icons/Pause';

import { DownArrow, UpArrow, HistoryForwardIcon, HistoryBackIcon } from '../../icons';

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

const styles = theme => {
  return {
    base: {
      backgroundColor: theme.palette.grey[999],
      height: '64px',
      borderRadius: '32px',
      padding: theme.spacing.unit,
      maxWidth: 510,
      margin: '0 auto',
      minWidth: 450,
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
        color: theme.palette.grey[700]
      },
      '&.small': {
        width: '60%',
        height: '60%',
      },
      '&.circle': {
        border: '1px solid ' + theme.palette.grey[900],
        borderRadius: '50%'
      }
    },
    tinyArrow: {
      display: 'flex',
      height: 12,
    },
    tinyArrowIcon: {
      width: 12,
      height: 12,
      color: theme.palette.grey[700]
    },
    iconButton: {
      maxWidth: '100%',
      maxHeight: '100%'
    },
    iconBox: {
      display: 'inline-block',
      borderRight: '1px solid ' + theme.palette.grey[900]
    },
    dateTime: {
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'center',
    },
    currentTime: {
      fontSize: 15,
      fontWeight: 500,
      display: 'block',
      marginTop: 4,
    }
  }
};

class TimeDisplay extends Component {
  constructor (props) {
    super(props);

    this.textHolder = React.createRef();

    this.updateTime = this.updateTime.bind(this);
    this.togglePause = this.togglePause.bind(this);
    this.jumpForward = this.jumpForward.bind(this);
    this.jumpBack = this.jumpBack.bind(this);
    this.increaseSpeed = this.increaseSpeed.bind(this);
    this.decreaseSpeed = this.decreaseSpeed.bind(this);

    this.state = {
      playSpeed: 1,
      displayTime: this.getDisplayTime()
    };
  }

  componentDidUpdate (prevProps, prevState) {
    if (this.props.playSpeed !== 0 && this.props.playSpeed !== this.state.playSpeed) {
      this.setState({
        playSpeed: this.props.playSpeed
      });
    }
  }

  componentDidMount () {
    this.mounted = true;
    raf(this.updateTime);
  }
  componentWillUnmount () {
    this.mounted = false;
  }

  togglePause (e) {
    if (this.props.playSpeed === 0) {
      TimelineWorker.play(this.state.playSpeed);
    } else {
      TimelineWorker.pause();
    }
  }

  jumpBack (amount) {
    TimelineWorker.seek(TimelineWorker.currentOffset() - amount);
  }

  jumpForward (amount) {
    TimelineWorker.seek(TimelineWorker.currentOffset() + amount);
  }

  increaseSpeed () {
    let curIndex = timerSteps.indexOf(this.state.playSpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.min(timerSteps.length - 1, curIndex + 1);
    TimelineWorker.play(timerSteps[curIndex]);
  }

  decreaseSpeed () {
    let curIndex = timerSteps.indexOf(this.state.playSpeed);
    if (curIndex === -1) {
      curIndex = timerSteps.indexOf(1);
    }
    curIndex = Math.max(0, curIndex - 1);
    TimelineWorker.play(timerSteps[curIndex]);
  }

  updateTime () {
    if (!this.mounted || !this.textHolder.current) {
      return;
    }
    let displayTime = this.getDisplayTime();
    if (this.state.displayTime !== displayTime) {
      this.setState({ displayTime });
    }

    raf(this.updateTime);
  }

  getDisplayTime () {
    var currentOffset = TimelineWorker.currentOffset();
    var start = this.props.start;
    if (!Number.isFinite(start)) {
      return '...';
    }
    var now = new Date(currentOffset + start);
    var dateString = fecha.format(now, 'ddd, D MMM, YYYY @ HH:mm:ss');
    // var dateString = fecha.format(now, 'MMM D @ HH:mm:ss');

    return dateString;
  }

  render () {
    const { classes } = this.props;
    const isPaused = this.props.playSpeed === 0;
    return (
      <div
        className={ cx(classes.base, {
          isExpanded: this.props.expanded,
          isThin: this.props.isThin,
        }) }>
        <Grid container>
          <Grid item xs={ 3 }>
            <Grid container>
              <Grid item align='center' xs={ 6 } className={ classes.iconBox } >
                <IconButton
                  onClick={ partial(this.jumpBack, 10000) }
                  aria-label='Jump back 10 seconds'>
                  <HistoryBackIcon className={ classes.icon + ' small dim' } />
                </IconButton>
              </Grid>
              <Grid item align='center' xs={ 6 } className={ classes.iconBox } >
                <IconButton
                  onClick={ partial(this.jumpForward, 10000) }
                  aria-label='Jump forward 10 seconds'>
                  <HistoryForwardIcon className={ classes.icon + ' small dim' } />
                </IconButton>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={ 6 } className={ classes.dateTime }>
            { !this.props.isThin && (
              <Typography variant='caption' align='center' style={{ paddingTop: 4 }}>
                CURRENT PLAYBACK TIME
              </Typography>
            )}
            <Typography variant='body1' align='center'>
              <span ref={ this.textHolder } className={ classes.currentTime } >
                { this.state.displayTime }
              </span>
            </Typography>
          </Grid>
          <Grid item xs={ 3 }>
            <Grid container>
              <Grid item align='center' xs={ 4 } className={ classes.iconBox } >
                <Grid container alignItems='center' direction='column'>
                  <Grid item className={ classes.tinyArrow }>
                    <IconButton
                      className={ classes.tinyArrowIcon }
                      onClick={ this.increaseSpeed }
                      aria-label='Increase play speed by 1 step'>
                      <UpArrow className={ classes.tinyArrowIcon } />
                    </IconButton>
                  </Grid>
                  <Grid item>
                    <Typography variant='body2' align='center'>
                      { this.state.playSpeed }x
                    </Typography>
                  </Grid>
                  <Grid item className={ classes.tinyArrow }>
                    <IconButton
                      className={ classes.tinyArrowIcon }
                      onClick={ this.decreaseSpeed }
                      aria-label='Decrease play speed by 1 step'>
                      <DownArrow className={ classes.tinyArrowIcon } />
                    </IconButton>
                  </Grid>
                </Grid>
              </Grid>
              <Grid item align='center' xs={ 8 } >
                <IconButton
                  onClick={ this.togglePause }
                  aria-label={ isPaused ? 'Unpause' : 'Pause' } >
                { isPaused
                  ? ( <PlayArrow className={ classes.icon + ' circle' } /> )
                  : ( <Pause className={ classes.icon + ' circle' } /> )
                }
                </IconButton>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  expanded: 'zoom.expanded',
  playSpeed: 'workerState.desiredPlaySpeed',
  start: 'workerState.start',
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
