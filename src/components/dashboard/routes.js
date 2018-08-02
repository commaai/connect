import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Badge from '@material-ui/core/Badge';
import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';

import { filterEvent } from '../annotations/common';
import Minimap from '../minimap';
import { selectRange } from '../../actions';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = theme => {
  return {
    root: {},
    header: {
      alignItems: 'center',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      padding: 12,
      paddingLeft: 48,
      paddingRight: 60,
    },
    headerLabel: {
      cursor: 'default',
      textTransform: 'uppercase',
    },
    drives: {
      height: '100%',
      overflowY: 'scroll',
      paddingLeft: 24,
      paddingRight: 24,
    },
    drive: {
      background: 'rgba(255, 255, 255, 0.0)',
      background: 'linear-gradient(to bottom, #30373B 0%, #1D2225 100%)',
      borderTop: '1px solid rgba(255, 255, 255, .05)',
      borderRadius: 8,
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      marginBottom: 12,
      overflow: 'hidden',
      padding: 0,
      transition: 'background .2s',
      '&:hover': {}
    },
    driveHeader: {
      alignItems: 'center',
      fontSize: 18,
      padding: 18,
      paddingLeft: 24,
      paddingRight: 24,
      width: '100%',
    },
    driveHeaderIntro: {
      alignItems: 'center',
      display: 'flex',
    },
    driveAvatar: {
      background: '#404B4F',
      borderRadius: 30,
      height: 52,
      width: 52,
    },
    driveTitle: {
      marginLeft: 18,
    },
    driveTimeline: {
      height: 60,
      width: '100%',
    },
  }
};

class RouteList extends Component {
  constructor (props) {
    super(props);

    this.renderRide = this.renderRide.bind(this);
    this.showRide = this.showRide.bind(this);
    this.goToAnnotation = this.goToAnnotation.bind(this);
    this.filterShortRides = this.filterShortRides.bind(this);
  }
  showRide (ride) {
    let startTime = ride.startTime - 1000;
    let endTime = ride.startTime + ride.duration + 1000;

    this.props.dispatch(selectRange(startTime, endTime));
  }
  goToAnnotation (segment) {
    let startTime = segment.startTime - this.props.zoomBuffer;
    let endTime = segment.startTime + segment.duration + this.props.zoomBuffer;
    this.props.dispatch(selectRange(startTime, endTime));
  }
  render () {
    const { classes } = this.props;
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
          duration: 0,
          annotations: 0
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
      curRideChunk.annotations += segment.events.filter(filterEvent).reduce((memo, event) => event.id ? memo : memo + 1, 0);
    });

    return (
      <React.Fragment>
        <Grid container className={ classes.header }>
          <Grid item xs={ 4 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Unresolved Drives
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Duration
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Start
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              End
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Distance
            </Typography>
          </Grid>
        </Grid>
        { rideList.length === 0 && this.renderZeroRides() }
        <List className={ classes.drives }>
          { rideList.filter(this.filterShortRides).map(this.renderRide) }
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
      zeroRidesEle = <Typography>Looks like you haven{'\''}t driven in the selected time range.</Typography>
    }

    return (
      <Grid container>
        { zeroRidesEle }
      </Grid>
    );
  }

  renderRide (ride) {
    const { classes } = this.props;
    // badgeContent={ ride.annotations }
    return (
      <ListItem
        key={ ride.startTime }
        className={ classes.drive }
        onClick={ partial(this.showRide, ride) }>
        <Grid container className={ classes.driveHeader }>
          <Grid item xs={ 4 } className={ classes.driveHeaderIntro }>
            <div className={ classes.driveAvatar } />
            <div className={ classes.driveTitle }>
              <Typography variant='body2'>
                Daly City to Fremont
              </Typography>
              <Typography>
                Honda Civic
              </Typography>
            </div>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='body2'>
              1hr 12min
            </Typography>
            <Typography>
              144 points
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='body2'>
              { fecha.format(new Date(ride.startTime), 'HH:mm') }
            </Typography>
            <Typography>
              { fecha.format(new Date(ride.startTime), 'MMMM D') }
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='body2'>
              { fecha.format(new Date(ride.startTime + ride.duration + 1000), 'HH:mm') }
            </Typography>
            <Typography>
              { fecha.format(new Date(ride.startTime + ride.duration + 1000), 'MMMM D') }
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='body2'>
              32.4 mi
            </Typography>
            <Typography>
              52.2 mi
            </Typography>
          </Grid>
        </Grid>
        <div className={ classes.driveTimeline }>
          <Minimap gradient zoomed colored thumbnailed zoomOverride={{
            start: ride.startTime,
            end: ride.startTime + ride.duration
          }} />
        </div>
      </ListItem>
    );
  }

  filterShortRides(ride) {
    return ride.duration >= 180000;
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  start: 'workerState.start',
  devices: 'workerState.devices',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(RouteList));
