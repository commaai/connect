import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import Divider from '@material-ui/core/Divider';

import Minimap from '../minimap';
import { selectRange } from '../../actions';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = theme => {
  root: {}
};

class RouteList extends Component {
  constructor (props) {
    super(props);

    this.renderRide = this.renderRide.bind(this);
    this.showRide = this.showRide.bind(this);
  }
  showRide (ride) {
    let startTime = ride.startTime - 1000;
    let endTime = ride.startTime + ride.duration + 1000;

    this.props.dispatch(selectRange(startTime, endTime));
  }
  render () {
    var rideList = [];
    var lastEnd = 0;
    var lastSegmentEnd = 0;
    var curRideChunk = null;
    this.props.segments.forEach(function (segment) {
      if (!curRideChunk || segment.startTime - lastEnd > MIN_TIME_BETWEEN_ROUTES) {
        curRideChunk = {
          segments: 0,
          startTime: segment.startTime,
          offset: segment.offset,
          duration: 0
        };
        rideList.unshift(curRideChunk);
        lastSegmentEnd = segment.startTime;
      }
      curRideChunk.duration += segment.startTime - lastSegmentEnd;
      curRideChunk.duration += segment.duration;
      lastSegmentEnd = segment.startTime + segment.duration;
      // curRideChunk.segments.push(segment);
      curRideChunk.segments++;
      lastEnd = segment.startTime + segment.duration;
      console.log(segment);
    });
    return (
      <React.Fragment>
        <Typography variant='headline'>
          Recent Drives
        </Typography>
        <Grid container>
          { rideList.map(this.renderRide) }
        </Grid>
      </React.Fragment>
    );
  }

  renderRide (ride) {
    return (
      <React.Fragment key={ ride.startTime }>
        <Grid item xs={12} >
          <Minimap zoomed colored thumbnailed zoomOverride={{
            start: ride.startTime,
            end: ride.startTime + ride.duration
          }} />
        </Grid>
        <Grid item xs={8} >
          Your ride on { fecha.format(new Date(ride.startTime), 'MMMM D @ HH:mm') }
        </Grid>
        <Grid item xs={4} >
          <Button variant='outlined' onClick={ partial(this.showRide, ride) }>
            Review
          </Button>
        </Grid>
        <Grid item xs={12} >
          <Divider />
        </Grid>
      </React.Fragment>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments'
});

export default connect(stateToProps)(withStyles(styles)(RouteList));
