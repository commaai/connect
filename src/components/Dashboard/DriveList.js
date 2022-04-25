import React, { Component } from 'react';
import { connect } from 'react-redux';
import fecha from 'fecha';
import Obstruction from 'obstruction';
import { withStyles, Grid, Typography } from '@material-ui/core';

import Colors from '../../colors';
import DriveListDivider from './DriveListDivider';
import DriveListItem from './DriveListItem';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import { checkSegmentMetadata } from '../../actions';

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

    this.state = {
      windowWidth: window.innerWidth,
    };

    this.fakeItemRef = React.createRef();

    this.onResize = this.onResize.bind(this);
    this.onVisible = this.onVisible.bind(this);
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  async onVisible() {
    this.props.dispatch(checkSegmentMetadata());
  }

  render() {
    const { classes, dongleId } = this.props;
    const { windowWidth } = this.state;

    const driveList = this.props.segments.slice().reverse().map((segment) => ({
      ...segment,
      dongleId: dongleId,
    }));

    const small = windowWidth < 640;

    const drivesGroupedByDate = driveList.reduce((dates, drive) => {
      const date = fecha.format(new Date(drive.startTime), small ? 'ddd, MMM D' : 'dddd, MMMM D');
      if (!dates[date]) {
        dates[date] = [];
      }
      dates[date].push(drive);
      return dates;
    }, {});

    return (
      <div className={ classes.drivesTable }>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.onVisible } minInterval={ 60 } />
        { driveList.length === 0 && this.renderZeroRides() }
        <div className={classes.drives}>
          { Object.entries(drivesGroupedByDate).map(([date, drives]) => (
            <>
              <DriveListDivider key={date} date={date} small={small} />
              { drives.map((drive) => (
                <DriveListItem key={drive.startTime} drive={drive} windowWidth={windowWidth} />
              ))}
            </>
          ))}
        </div>
      </div>
    );
  }

  renderZeroRides() {
    const { classes, device, segmentData } = this.props;
    const { windowWidth } = this.state;
    let zeroRidesEle = null;

    if (device && (segmentData === null || segmentData.segments === undefined)) {
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
  segments: 'segments',
  segmentData: 'segmentData',
  device: 'device',
  dongleId: 'dongleId',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
