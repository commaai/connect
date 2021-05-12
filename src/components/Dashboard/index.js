import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';

import { selectRange, selectDevice, primeNav } from '../../actions';
import { filterEvent } from '../../utils';
import DeviceList from './DeviceList';
import DriveList from './DriveList';
import Prime from '../Prime';
import PrimeBanner from '../Prime/PrimeBanner'

const styles = (/* theme */) => ({
  base: {
    background: 'linear-gradient(180deg, #1D2225 0%, #16181A 100%)',
    display: 'flex',
    flexGrow: 0,
    minWidth: '100%',
    flexWrap: 'wrap',
  },
  window: {
    display: 'flex',
    flexGrow: 1,
    flexDirection: 'column',
  },
});

class Dashboard extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    const { classes, primeNav, device } = this.props;

    return (
      <div className={classes.base}>
        <div className={classes.window}>
          { primeNav ?
            ( <Prime /> )
          : ( <>
            { device && !device.prime && device.is_owner && <PrimeBanner collapsed /> }
            <DriveList />
          </> ) }
        </div>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  segments: 'workerState.segments',
  selectedDongleId: 'workerState.dongleId',
  primeNav: 'workerState.primeNav',
  device: 'workerState.device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
