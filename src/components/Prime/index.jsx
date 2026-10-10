import { connect } from 'react-redux';

import { Typography } from '@material-ui/core';
import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';

const Prime = (props) => {
  const { device, profile, stripeCancelled, stripeSuccess } = props;
  if (!profile || !device) {
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
  stripeSuccess: state.navigation?.query.stripe_success,
  stripeCancelled: state.navigation?.query.stripe_cancelled,
  subscription: state.subscription,
  device: state.device,
  profile: state.profile,
});

export default connect(stateToProps)(Prime);
