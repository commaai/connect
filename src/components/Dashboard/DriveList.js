import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { partial } from 'ap';
import fecha from 'fecha';

import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';

import { filterEvent } from '../../utils';
import { selectRange } from '../../actions';
import GeocodeApi from '../../api/geocode';
import DriveListItem from './DriveListItem';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = theme => {
  return {
    header: {
      alignItems: 'center',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      padding: 16,
      paddingLeft: 48,
      paddingRight: 60,
    },
    headerLabel: {
      cursor: 'default',
      textTransform: 'uppercase',
    },
    drives: {
      height: '100%',
      margin: 0,
      overflowY: 'scroll',
      padding: 16,
      paddingLeft: 24,
      paddingRight: 24,
    },
  }
};

class DriveList extends Component {
  constructor (props) {
    super(props);

    this.goToAnnotation = this.goToAnnotation.bind(this);
    this.filterShortDrives = this.filterShortDrives.bind(this);
    this.renderDriveListHeader = this.renderDriveListHeader.bind(this);
  }

  filterShortDrives(ride) {
    return ride.duration >= 180000;
  }

  goToAnnotation (segment) {
    let startTime = segment.startTime - this.props.zoomBuffer;
    let endTime = segment.startTime + segment.duration + this.props.zoomBuffer;
    this.props.dispatch(selectRange(startTime, endTime));
  }

  render () {
    const { classes, device, segments } = this.props;
    const deviceAlias = device.alias || device.device_type;
    var driveList = [];
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
          annotations: 0,
          startCoord: segment.startCoord,
          endCoord: segment.endCoord,
        };
        driveList.unshift(curRideChunk);
        lastSegmentEnd = segment.startTime;
      }
      curRideChunk.duration += segment.startTime - lastSegmentEnd;
      curRideChunk.duration += segment.duration;
      lastSegmentEnd = segment.startTime + segment.duration;
      curRideChunk.segments++;
      lastEnd = segment.startTime + segment.duration;
      curRideChunk.annotations += segment.events.filter(filterEvent)
        .reduce((memo, event) => event.id ? memo : memo + 1, 0);
    });

    return (
      <React.Fragment>
        { this.renderDriveListHeader() }
        { driveList.length === 0 && this.renderZeroRides() }
        <ul className={ classes.drives }>
          { driveList.filter(this.filterShortDrives).map((drive) => {
              return (
                <DriveListItem
                  key={ drive.startTime }
                  drive={ drive }
                  deviceAlias={ deviceAlias } />
              )
            })
          }
        </ul>
      </React.Fragment>
    );
  }

  renderZeroRides() {
    var zeroRidesEle = null;
    let device = this.props.device;
    let hasDrivesInQuery = (device && device.last_segment_utc_millis !== null)
      && (device.last_segment_utc_millis >= this.props.start);

    if (hasDrivesInQuery) {
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

  renderDriveListHeader() {
    const { classes, device } = this.props;
    const deviceAlias = device.alias || device.device_type;
    return (
      <div className={ classes.header }>
        <Grid container alignItems='center'>
          <Grid item xs={ 4 }>
            <Typography variant='title'>
              { deviceAlias } Drives
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Duration
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Origin
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Destination
            </Typography>
          </Grid>
          <Grid item xs={ 2 }>
            <Typography variant='caption' className={ classes.headerLabel }>
              Distance
            </Typography>
          </Grid>
        </Grid>
      </div>
    )
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  start: 'workerState.start',
  devices: 'workerState.devices',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
