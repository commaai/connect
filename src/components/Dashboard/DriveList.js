import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles, Typography, Grid } from '@material-ui/core';

import Colors from '../../colors';
import DriveListItem from './DriveListItem';
import ResizeHandler from '../ResizeHandler';
import VisibilityHandler from '../VisibilityHandler';
import { checkRoutesData } from '../../actions';
import { hasRoutesData } from '../../timeline/segments';

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
    this.props.dispatch(checkRoutesData());
  }

  render() {
    const { classes } = this.props;

    const driveList = this.props.routes || [];

    return (
      <div className={ classes.drivesTable }>
        <ResizeHandler onResize={ this.onResize } />
        <VisibilityHandler onVisible={ this.onVisible } minInterval={ 60 } />
        { driveList.length === 0 && this.renderZeroRides() }
        <div className={ `${classes.drives} DriveList` }>
          { driveList.map((drive, i) => (
            <DriveListItem key={drive.start_time_utc_millis} drive={drive} windowWidth={ this.state.windowWidth } />
          ))}
        </div>
      </div>
    );
  }

  renderZeroRides() {
    const { classes, device, routes } = this.props;
    const { windowWidth } = this.state;
    let zeroRidesEle = null;

    if (device && routes === null) {
      zeroRidesEle = <Typography>Loading...</Typography>;
    } else if (hasRoutesData(this.props) && routes?.length === 0) {
      zeroRidesEle = <Typography>Looks like you haven{'\''}t driven in the selected time range.</Typography>;
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
  filter: 'filter',
  routes: 'routes',
  routesMeta: 'routesMeta',
  device: 'device',
  dongleId: 'dongleId',
});

export default connect(stateToProps)(withStyles(styles)(DriveList));
