import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import Colors from '../../colors';

import { withStyles, Typography, Grid } from '@material-ui/core';
import DriveListItem from './DriveListItem';
import ResizeHandler from '../ResizeHandler';

const MIN_TIME_BETWEEN_ROUTES = 60000; // 1 minute

const styles = (theme) => ({
  header: {
    alignItems: 'center',
    borderBottom: `1px solid ${Colors.white10}`,
    padding: '16px 48px',
    flexGrow: 0,
  },
  drivesTable: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  drives: {
    margin: 0,
    padding: 16,
    flex: '1',
  },
  zeroState: {
    flex: '0',
  },
  settingsArea: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  settingsButton: {
    position: 'relative',
    left: 12,
    border: `1px solid ${Colors.white40}`
  },
  settingsButtonIcon: {
    color: Colors.white40,
  },
});

class DriveList extends Component {
  constructor(props) {
    super(props);

    this.filterShortDrives = this.filterShortDrives.bind(this);
    this.onResize = this.onResize.bind(this);

    this.state = {
      windowWidth: window.innerWidth,
    };
  }

  componentWillReceiveProps(props) {
    if (props.device && !this.state.deviceAliasSaved) {
      this.setState({ deviceAliasSaved: props.device.alias });
    }
  }

  filterShortDrives(ride) {
    return ride.duration > 60000;
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  render() {
    const { classes } = this.props;

    const driveList = [];
    let lastEnd = 0;
    let lastSegmentEnd = 0;
    let curRideChunk = null;
    this.props.segments.forEach((segment) => {
      if (!curRideChunk || segment.startTime - lastEnd > MIN_TIME_BETWEEN_ROUTES) {
        curRideChunk = {
          segments: 0,
          startTime: segment.startTime,
          offset: segment.offset,
          duration: 0,
          startCoord: segment.startCoord,
          endCoord: segment.endCoord,
          distanceMiles: segment.distanceMiles,
        };
        driveList.unshift(curRideChunk);
        lastSegmentEnd = segment.startTime;
      }
      curRideChunk.duration += segment.startTime - lastSegmentEnd;
      curRideChunk.duration += segment.duration;
      lastSegmentEnd = segment.startTime + segment.duration;
      curRideChunk.segments++;
      lastEnd = segment.startTime + segment.duration;
    });

    return (
      <div className={ classes.drivesTable }>
        <ResizeHandler onResize={ this.onResize } />
        { driveList.length === 0 && this.renderZeroRides() }
        <ul className={classes.drives}>
          { driveList.filter(this.filterShortDrives).map((drive) => (
            <DriveListItem key={drive.startTime} drive={drive} windowWidth={ this.state.windowWidth }/>
          ))}
        </ul>
      </div>
    );
  }

  renderZeroRides() {
    const { classes, device, segmentData } = this.props;
    const { windowWidth } = this.state;
    let zeroRidesEle = null;

    if (device && (segmentData === null || typeof segmentData.segments === 'undefined')) {
      zeroRidesEle = <Typography>Loading...</Typography>;
    } else if (segmentData && segmentData.segments && segmentData.segments.length === 0) {
      zeroRidesEle = ( <Typography>Looks like you haven{'\''}t driven in the selected time range.</Typography> );
    }

    const containerPadding = windowWidth > 520 ? 36 : 16;
    return (
      <div className={classes.zeroState} style={{ padding: `16px ${containerPadding}px` }}>
        <Grid container>
          { zeroRidesEle }
        </Grid>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  segmentData: 'workerState.segmentData',
  start: 'workerState.start',
  device: 'workerState.device',
  dongleId: 'workerState.dongleId',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
