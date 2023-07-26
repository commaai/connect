import React from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';

import DeviceInfo from '../DeviceInfo';
import DriveList from './DriveList';
import Navigation from '../Navigation';
import Prime from '../Prime';

const Dashboard = ({ primeNav, device }) => (
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

const stateToProps = Obstruction({
  primeNav: 'primeNav',
  device: 'device',
});

export default connect(stateToProps)(Dashboard);
