import React, { lazy, Suspense } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { withStyles } from '@material-ui/core/styles';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';

const Prime = lazy(() => import('../Prime'));

const styles = () => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
  },
});

const Dashboard = ({ classes, primeNav, device, dongleId }) => {
  if (!device || !dongleId) {
    return null;
  }

  return (
    <div className={classes.base}>
      <Suspense>
        { primeNav
          ? <Prime />
          : (
            <>
              <Navigation hasNav={ device.prime && device.device_type === 'three' } />
              <DeviceInfo />
              <DriveList />
            </>
          )}
      </Suspense>
    </div>
  );
};

const stateToProps = Obstruction({
  dongleId: 'dongleId',
  primeNav: 'primeNav',
  device: 'device',
});

export default connect(stateToProps)(withStyles(styles)(Dashboard));
