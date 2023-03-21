import React, { lazy, Suspense } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { CircularProgress, Grid, withStyles } from '@material-ui/core';

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

const DashboardLoading = () => (
  <Grid container alignItems="center" style={{ width: '100%', height: '100vh' }}>
    <Grid item align="center" xs={12}>
      <CircularProgress size="10vh" style={{ color: '#525E66' }} />
    </Grid>
  </Grid>
);

const Dashboard = ({ classes, primeNav, device, dongleId }) => {
  if (!device || !dongleId) {
    return null;
  }

  return (
    <div className={classes.base}>
      <Suspense fallback={<DashboardLoading />}>
        { primeNav
          ? <Prime />
          : (
            <>
              <Navigation hasNav={device.prime && device.eligible_features?.nav} />
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
