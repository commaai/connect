import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import DriveList from './DriveList';
import Prime from '../Prime';
import PrimeBanner from '../Prime/PrimeBanner';
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
    const { classes, primeNav, device, dongleId } = this.props;

    if (!device || !dongleId) {
      return null;
    }

    return (
      <div className={classes.base}>
        { primeNav ?
          <Prime /> :
          <>
            <Navigation hasNav={ device.prime && device.device_type === 'three' } />
            { !device.prime && device.is_owner && <PrimeBanner collapsed /> }
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
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
