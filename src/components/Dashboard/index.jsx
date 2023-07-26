import React, { lazy } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import DeviceInfo from '../DeviceInfo';

const Prime = lazy(() => import('../Prime'));

const Dashboard = ({ primeNav, device }) => {
  return (
    <div className="flex flex-col">
      { primeNav
        ? <Prime />
        : (
          <>
            <Navigation hasNav={device.prime && device.eligible_features?.nav} />
            <DeviceInfo />
            <DriveList />
          </>
        )}
    </div>
  );
};

const stateToProps = Obstruction({
  primeNav: 'primeNav',
  device: 'device',
});

export default connect(stateToProps)(Dashboard);
