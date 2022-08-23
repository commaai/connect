import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

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
            <DeviceInfo />
            <DriveList />
          </>
        }
      </div>
    );
  }
}

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  primeNav: 'primeNav',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
