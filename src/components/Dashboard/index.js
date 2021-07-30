import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import CommaTwoUpsell from '../DriveView/commaTwoUpsell';
import DriveList from './DriveList';
import Prime from '../Prime';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';

const styles = (/* theme */) => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
  },
});

class Dashboard extends Component {
  render() {
    const { classes, primeNav, devices, device, dongleId } = this.props;

    if (devices && devices.length === 0) {
      return <CommaTwoUpsell hook="Get started with comma two" />
    }

    if (!device || !dongleId) {
      return null;
    }

    return (
      <div className={classes.base}>
        { primeNav ?
          <Prime /> :
          <>
            <Navigation hasNav={ device.prime && device.device_type === 'three' } />
            <DeviceInfo />
            <DriveList />
          </>
        }
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  dongleId: 'workerState.dongleId',
  primeNav: 'workerState.primeNav',
  device: 'workerState.device',
  devices: 'workerState.devices',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
