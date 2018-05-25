import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import raf from 'raf';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import Forward10 from '@material-ui/icons/Forward10';
import Replay10 from '@material-ui/icons/Replay10';


import TimelineWorker from '../../timeline';

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
    seperator: {
      borderLeft: '1px solid ' + theme.palette.grey[50]
    }
  }
};

class TimeDisplay extends Component {
  constructor (props) {
    super(props);

    this.textHolder = React.createRef();

    this.updateTime = this.updateTime.bind(this);
  }
  componentDidMount () {
    this.mounted = true;
    raf(this.updateTime);
  }
  componentWillUnmount () {
    this.mounted = false;
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
    return (
      <div className={ this.props.classes.root }>
        <Grid container className={ this.props.classes.fullHeight } xs={9} >
          <Grid item xs={1}>
            <Replay10 style={{ fontSize: 42, paddingLeft: 4, paddingTop: 4 }} />
          </Grid>
          <Grid item xs={1} className={ this.props.classes.seperator } >
            <Forward10 style={{ fontSize: 42, paddingLeft: 4, paddingTop: 4 }} />
          </Grid>
          <Grid item xs={5} className={ this.props.classes.seperator } >
            <Typography variant='caption' align='center'>
              CURRENT PLAYBACK TIME
            </Typography>
            <Typography variant='body' align='center'>
              <span ref={ this.textHolder }>{ this.getDisplayTime() }</span>
            </Typography>
          </Grid>
          <Grid item xs={1} className={ this.props.classes.seperator } >
          BLAH
          </Grid>
          <Grid item xs={1} className={ this.props.classes.seperator } >
          BLAH
          </Grid>
        </Grid>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  start: 'workerState.start'
});

export default connect(stateToProps)(withStyles(styles)(TimeDisplay));
