import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import Typography from '@material-ui/core/Typography';
import raf from 'raf';
import fecha from 'fecha';

import TimelineWorker from '../../timeline';

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
    var dateString = fecha.format(now, 'HH:MM:ss MMMM Do, YYYY');

    return dateString;
  }

  render () {
    return (
      <Typography variant='title' align='center'>
        <span ref={ this.textHolder }>{ this.getDisplayTime() }</span>
      </Typography>
    );
  }
}

const stateToProps = Obstruction({
  start: 'workerState.start'
});

export default connect(stateToProps)(TimeDisplay);
