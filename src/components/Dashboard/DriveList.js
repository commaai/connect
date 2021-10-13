import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, Grid } from '@material-ui/core';

import { drives as DrivesApi } from '@commaai/comma-api';
import Segments from '../../timeline/segments';
import store from '../../timeline/store';
import Colors from '../../colors';
import DriveListItem from './DriveListItem';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import * as Demo from '../../demo';

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
    this.onVisible = this.onVisible.bind(this);

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

  async onVisible() {
    const { dongleId, start, end } = this.props;
    if (!dongleId || Demo.isDemo()) {
      return;
    }

    store.dispatch(Segments.fetchSegmentMetadata(start, end));

    let segmentData;
    try {
      segmentData = await DrivesApi.getSegmentMetadata(start, end, dongleId);
    } catch (err) {
      Sentry.captureException(err, { fingerprint: 'drivelist_visible_segmentmetadata' });
      console.log(err);
      return;
    }

    if (this.props.start !== start || this.props.end !== end || this.props.dongleId !== dongleId) {
      return;
    }

    segmentData = Segments.parseSegmentMetadata({ dongleId, start, end }, segmentData);
    store.dispatch(Segments.insertSegmentMetadata(segmentData));
  }

  render() {
    const { classes, dongleId } = this.props;

    const driveList = [];
    let lastEnd = 0;
    let lastSegmentEnd = 0;
    let curRideChunk = null;
    this.props.segments.forEach((segment) => {
      if (!curRideChunk || segment.startTime - lastEnd > MIN_TIME_BETWEEN_ROUTES) {
        curRideChunk = {
          dongleId: dongleId,
          segments: 0,
          startTime: segment.startTime,
          offset: segment.offset,
          duration: 0,
          startCoord: segment.startCoord,
          endCoord: segment.endCoord,
          distanceMiles: 0,
        };
        driveList.unshift(curRideChunk);
        lastSegmentEnd = segment.startTime;
      }
      curRideChunk.duration += segment.startTime - lastSegmentEnd;
      curRideChunk.duration += segment.duration;
      lastSegmentEnd = segment.startTime + segment.duration;
      curRideChunk.segments++;
      lastEnd = segment.startTime + segment.duration;
      curRideChunk.distanceMiles += segment.distanceMiles;
      curRideChunk.endCoord = (segment.endCoord && !(segment.endCoord[0] === 0 && segment.endCoord[1] === 0)) ?
        segment.endCoord :
        curRideChunk.endCoord;
    });

    return (
      <div className={ classes.drivesTable }>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.onVisible } minInterval={ 60 } />
        { driveList.length === 0 && this.renderZeroRides() }
        <div className={classes.drives}>
          { driveList.filter(this.filterShortDrives).map((drive) => (
            <DriveListItem key={drive.startTime} drive={drive} windowWidth={ this.state.windowWidth }/>
          ))}
        </div>
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
  end: 'workerState.end',
  device: 'workerState.device',
  dongleId: 'workerState.dongleId',
  isSuperUser: 'workerState.profile.superuser',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
