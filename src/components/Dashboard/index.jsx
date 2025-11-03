import { CircularProgress, Grid } from '@mui/material';
import { lazy, memo, Suspense } from 'react';
import { useSelector } from 'react-redux';
import { withRouter } from 'react-router';
import DriveList from './DriveList';
import { getPrimeNav } from '../../url';

const Prime = lazy(() => import('../Prime'));

const DashboardLoading = () => (
  <Grid container alignItems="center" className="w-full h-screen">
    <Grid item align="center" xs={12}>
      <CircularProgress size="10vh" className="text-[#525E66]" />
    </Grid>
  </Grid>
);

const Dashboard = memo(({ location }) => {
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
          <DriveList />
        )}
      </Suspense>
    </div>
  );
});

Dashboard.displayName = 'Dashboard';

export default withRouter(Dashboard);
