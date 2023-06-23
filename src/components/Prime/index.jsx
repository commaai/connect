import React from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import qs from 'query-string';

import { Typography } from '@material-ui/core';
import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';

const Prime = (props) => {
  let stripeCancelled;
  let stripeSuccess;
  if (window.location) {
    const params = qs.parse(window.location.search);
    stripeCancelled = params.stripe_cancelled;
    stripeSuccess = params.stripe_success;
  }

  const { device, profile } = props;
  if (!profile) {
    return null;
  }

  if (!device.is_owner && !profile.superuser) {
    return (<Typography>No access</Typography>);
  }
  if (device.prime || stripeSuccess) {
    return (<PrimeManage stripeSuccess={ stripeSuccess } />);
  }
  return (<PrimeCheckout stripeCancelled={ stripeCancelled } />);
};

const stateToProps = Obstruction({
  subscription: 'subscription',
  device: 'device',
  profile: 'profile',
});

export default connect(stateToProps)(Prime);
