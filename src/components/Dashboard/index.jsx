import React, { lazy, Suspense, useEffect } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import { CircularProgress, Grid } from '@material-ui/core';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';

const Prime = lazy(() => import('../Prime'));

const DashboardLoading = () => (
  <Grid container alignItems="center" style={{ width: '100%', height: '100vh' }}>
    <Grid item align="center" xs={12}>
      <CircularProgress size="10vh" style={{ color: '#525E66' }} />
    </Grid>
  </Grid>
);

// Persist the dashboard's scroll position across navigation so closing a route
// returns the user to where they were. Stored in sessionStorage keyed by
// dongleId so different devices don't stomp each other.
const useDashboardScrollRestore = (dongleId) => {
  useEffect(() => {
    if (!dongleId) return undefined;
    const key = `dashboard-scroll-${dongleId}`;

    const saved = sessionStorage.getItem(key);
    if (saved !== null) {
      // Defer to next frame so children have a chance to lay out before we scroll.
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
    }

    const onScroll = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dongleId]);
};

const Dashboard = ({ primeNav, device, dongleId }) => {
  useDashboardScrollRestore(primeNav ? null : dongleId);

  if (!device || !dongleId) {
    return <DashboardLoading />;
  }

  return (
    <div className="flex flex-col">
      <Suspense fallback={<DashboardLoading />}>
        { primeNav
          ? <Prime />
          : (
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
