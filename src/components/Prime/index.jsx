import React from 'react';
import { connect } from 'react-redux';

import { Typography } from '@material-ui/core';
import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';

const Prime = (props) => {
  let stripeCancelled;
  let stripeSuccess;
  if (window.location) {
    const params = new URLSearchParams(window.location.search);
    stripeCancelled = params.get('stripe_cancelled');
    stripeSuccess = params.get('stripe_success');
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

const stateToProps = (state) => ({
  subscription: state.subscription,
  device: state.device,
  profile: state.profile,
});

export default connect(stateToProps)(Prime);
