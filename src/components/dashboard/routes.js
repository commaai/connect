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
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';

import Minimap from '../minimap';
import { selectRange } from '../../actions';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = theme => {
  return {
    root: {},
    review: {
      padding: theme.spacing.unit,
      minWidth: 0,
      top: '50%',
      transform: 'translateY(-50%)'
    }
  }
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
    });

    return (
      <React.Fragment>
        { rideList.length === 0 && this.renderZeroRides() }
        <List>
          { rideList.map(this.renderRide) }
        </List>
      </React.Fragment>
    );
  }

  renderZeroRides() {
    var zeroRidesEle = null;
    let device = this.props.device;
    let hasRideInTimeWindow = device && device.last_segment_utc_millis !== null && device.last_segment_utc_millis >= this.props.start;

    if (hasRideInTimeWindow) {
      zeroRidesEle = <Typography>Loading...</Typography>;
    } else {
      zeroRidesEle = <Typography>Looks like you haven't driven in the selected time range.</Typography>
    }

    return (
      <Grid container>
        { zeroRidesEle }
      </Grid>
    );
  }

  renderRide (ride) {
    return (
      <ListItem key={ ride.startTime }>
        <Grid container >
          <Grid item xs={2} >
            <Button variant='outlined' onClick={ partial(this.showRide, ride) } className={ this.props.classes.review }>
              Review
            </Button>
          </Grid>
          <Grid item xs={10} >
            <Grid container >
              <Grid item xs={12} >
                <Typography>
                  Your ride on { fecha.format(new Date(ride.startTime), 'MMMM D @ HH:mm') }
                </Typography>
              </Grid>
              <Grid item xs={12} >
                <Minimap zoomed colored thumbnailed zoomOverride={{
                  start: ride.startTime,
                  end: ride.startTime + ride.duration
                }} />
              </Grid>
              <Grid item xs={12} >
                <Divider />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </ListItem>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  start: 'workerState.start',
  devices: 'workerState.devices',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(RouteList));
