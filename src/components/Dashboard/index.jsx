import { CircularProgress, Grid } from '@material-ui/core';
import { lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import { withRouter } from 'react-router';
import DeviceInfo from '../DeviceInfo';
import Navigation from '../Navigation';
import DriveList from './DriveList';

const Prime = lazy(() => import('../Prime'));

const DashboardLoading = () => (
  <Grid container alignItems="center" className="w-full h-screen">
    <Grid item align="center" xs={12}>
      <CircularProgress size="10vh" className="text-[#525E66]" />
    </Grid>
  </Grid>
);

import { getPrimeNav } from '../../url';

const Dashboard = ({ location }) => {
  const device = useSelector((state) => state.device);
  const dongleId = useSelector((state) => state.dongleId);

  const primeNav = getPrimeNav(location?.pathname || '/');
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

export default withRouter(Dashboard);
