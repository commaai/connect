import { CircularProgress, Grid } from '@material-ui/core';
import Obstruction from 'obstruction';
import React, { lazy, Suspense } from 'react';
import { connect } from 'react-redux';
import DeviceInfo from '../DeviceInfo/index.jsx';
import Navigation from '../Navigation/index.jsx';
import DriveList from './DriveList.jsx';

const Prime = lazy(() => import('../Prime/index.jsx'));

const DashboardLoading = () => (
  <Grid container alignItems="center" style={{ width: '100%', height: '100vh' }}>
    <Grid item align="center" xs={12}>
      <CircularProgress size="10vh" style={{ color: '#525E66' }} />
    </Grid>
  </Grid>
);

const Dashboard = ({ primeNav, device, dongleId }) => {
  if (!device || !dongleId) {
    return <DashboardLoading />;
  }

  return (
    <div className="flex flex-col">
      <Suspense fallback={<DashboardLoading />}>
        {primeNav ? (
          <Prime />
        ) : (
          <>
            <Navigation />
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

export default connect(stateToProps)(Dashboard);
