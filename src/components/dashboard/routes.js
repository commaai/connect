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
    routeListHeader: {
      alignItems: 'center',
      padding: 12,
      paddingLeft: 24,
      paddingRight: 24,
    },
    routeListHeaderButton: {
      background: 'linear-gradient(to bottom, rgb(82, 94, 102) 0%, rgb(64, 75, 79) 100%)',
      borderRadius: 30,
      color: '#fff',
      height: 45,
    },
    routeListHeaderName: {
      fontWeight: 500,
    },
    routeListItem: {
      background: 'rgba(255, 255, 255, 0.0)',
      borderTop: '1px solid rgba(255, 255, 255, .05)',
      cursor: 'pointer',
      transition: 'background .2s',
      '&:hover': {
        background: '#30373B',
        borderRadius: 12,
      }
    },
    routeListItemHeader: {
      alignItems: 'center',
      fontSize: 18,
      paddingBottom: 12,
    },
    routeListItemHeaderName: {
      fontSize: 18,
      fontWeight: 600,
    },
    routeListItemHeaderButton: {
      background: 'transparent',
      border: '1px solid #272D30',
      borderRadius: 20,
      // color: '#404B4F',
      color: '#fff',
      transitionDuration: '.1s',
      '&:hover': {
        background: '#758791',
        borderColor: '#fff',
      },
    },
    review: {
      padding: 8,
      minWidth: 0,
      top: '50%',
      transform: 'translateY(-50%)'
    },
    selectedDeviceText: {
      color: '#49545B'
    }
  }
};

class RouteList extends Component {
  constructor (props) {
    super(props);

    this.renderRide = this.renderRide.bind(this);
    this.showRide = this.showRide.bind(this);
    this.goToAnnotation = this.goToAnnotation.bind(this);
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
        <Grid container className={ this.props.classes.routeListHeader }>
          <Grid item xs={ 9 }>
            <Typography variant='headline' className={ this.props.classes.routeListHeaderName }>
              Recent Drives
              { this.props.device &&
                  <span className={ this.props.classes.selectedDeviceText }> - { this.props.device.alias || this.props.device.device_type }</span>
              }
            </Typography>
          </Grid>
          <Grid item xs={ 3 }>
            { this.props.renderAnnotateButton() }
          </Grid>
        </Grid>
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
      zeroRidesEle = <Typography>Looks like you haven{'\''}t driven in the selected time range.</Typography>
    }

    return (
      <Grid container>
        { zeroRidesEle }
      </Grid>
    );
  }

  renderRide (ride) {
    return (
      <ListItem key={ ride.startTime } className={ this.props.classes.routeListItem }  onClick={ partial(this.showRide, ride) }>
        <Grid container>
          <Grid container className={ this.props.classes.routeListItemHeader }>
            <Grid item xs={8} >
              <Typography className={ this.props.classes.routeListItemHeaderName }>
                { fecha.format(new Date(ride.startTime), 'MMMM D @ HH:mm') } -
                { fecha.format(new Date(ride.startTime + ride.duration + 1000), ' HH:mm') }
              </Typography>
            </Grid>
            <Grid item xs={4} >
              <Button variant='outlined' fullWidth onClick={ partial(this.showRide, ride) } className={ this.props.classes.routeListItemHeaderButton }>
                Review Drive
              </Button>
            </Grid>
          </Grid>
          <Grid item xs={12} >
            <Minimap gradient zoomed colored thumbnailed zoomOverride={{
              start: ride.startTime,
              end: ride.startTime + ride.duration
            }} />
          </Grid>
          <Grid item xs={12} >
            <Divider />
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
