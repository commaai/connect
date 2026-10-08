import { connect } from 'react-redux';

import { Typography } from '@material-ui/core';
import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';

const Prime = (props) => {
  // the Stripe redirect's result, consumed from the URL by the navigation effects
  const { device, profile, stripeResult } = props;
  const stripeCancelled = stripeResult?.cancelled ?? null;
  const stripeSuccess = stripeResult?.success ?? null;

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
  stripeResult: state.primeStripeResult,
});

export default connect(stateToProps)(Prime);
