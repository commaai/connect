import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import fecha from 'fecha';
import { partial } from 'ap';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';

import Forward10 from '@material-ui/icons/Forward10';
import Replay10 from '@material-ui/icons/Replay10';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Pause from '@material-ui/icons/Pause';
import ArrowDropDown from '@material-ui/icons/ArrowDropDown';
import ArrowDropUp from '@material-ui/icons/ArrowDropUp';

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
  console.log(theme);
  return {
    root: {
      backgroundColor: theme.palette.grey[999],
      height: '64px',
      borderRadius: '32px',
      padding: theme.spacing.unit
    },
    fullHeight: {
      height: '100%'
    },
    icon: {
      width: '98%',
      height: '98%'
    },
    tinyArrow: {
      width: 20,
      height: 20,
    },
    iconButton: {
      maxWidth: '100%',
      maxHeight: '100%'
    },
    verticalButtons: {
      marginTop: -6
    },
    speedText: {
      marginTop: 3
    },
    iconBox: {
      display: 'inline-block',
      borderRight: '1px solid ' + theme.palette.grey[50]
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
      playSpeed: 1
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
    this.textHolder.current.innerHTML = this.getDisplayTime();

    raf(this.updateTime);
  }

  getDisplayTime () {
    var currentOffset = TimelineWorker.currentOffset();
    var start = this.props.start;
    if (!Number.isFinite(start)) {
      return '...';
    }
    var now = new Date(currentOffset + start);
    var dateString = fecha.format(now, 'ddd, D MMMM, YYYY @ HH:mm:ss');

    return dateString;
  }

  render () {
    const isPaused = this.props.playSpeed === 0;
    return (
      <div className={ this.props.classes.root }>
        <Grid container className={ this.props.classes.fullHeight } >
          <Grid item xs={3}>
            <Grid container className={ this.props.classes.fullHeight } >
              <Grid item align='center' xs={6} className={ this.props.classes.iconBox } >
                <IconButton className={ this.props.classes.iconButton } onClick={ partial(this.jumpBack, 10000) } aria-label='Jump back 10 seconds' >
                  <Replay10 className={ this.props.classes.icon } />
                </IconButton>
              </Grid>
              <Grid item align='center' xs={6} className={ this.props.classes.iconBox } >
                <IconButton className={ this.props.classes.iconButton } onClick={ partial(this.jumpForward, 10000) } aria-label='Jump forward 10 seconds' >
                  <Forward10 className={ this.props.classes.icon } />
                </IconButton>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={6} className={ this.props.classes.seperator } >
            <Typography variant='caption' align='center'>
              CURRENT PLAYBACK TIME
            </Typography>
            <Typography variant='body1' align='center'>
              <span ref={ this.textHolder }>{ this.getDisplayTime() }</span>
            </Typography>
          </Grid>
          <Grid item xs={3} className={ this.props.classes.seperator } >
            <Grid container className={ this.props.classes.fullHeight } >
              <Grid item align='center' xs={4} className={ this.props.classes.iconBox } >
                <Grid container justify='center' alignItems='center' direction='column' className={ this.props.classes.verticalButtons } >
                  <Grid item >
                    <IconButton className={ this.props.classes.tinyArrow } onClick={ this.increaseSpeed } aria-label='Increase play speed by 1 step' >
                      <ArrowDropUp />
                    </IconButton>
                  </Grid>
                  <Grid item className={ this.props.classes.speedText } >
                    <Typography variant='body1' align='center'>
                      { this.state.playSpeed }x
                    </Typography>
                  </Grid>
                  <Grid item >
                    <IconButton className={ this.props.classes.tinyArrow } onClick={ this.decreaseSpeed } aria-label='Decrease play speed by 1 step' >
                      <ArrowDropDown />
                    </IconButton>
                  </Grid>
                </Grid>
              </Grid>
              <Grid item align='center' xs={8} >
                <IconButton className={ this.props.classes.iconButton } onClick={ this.togglePause } aria-label={ isPaused ? 'Unpause' : 'Pause' } >
                { isPaused
                  ? ( <PlayArrow className={ this.props.classes.icon } /> )
                  : ( <Pause className={ this.props.classes.icon } /> )
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
  playSpeed: 'workerState.playSpeed',
  start: 'workerState.start'
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
