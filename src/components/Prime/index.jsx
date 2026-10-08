import { connect } from 'react-redux';

import { Typography } from '@material-ui/core';
import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';

const Prime = (props) => {
  const params = new URLSearchParams(props.search);
  const stripeCancelled = params.get('stripe_cancelled');
  const stripeSuccess = params.get('stripe_success');

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
  search: state.router.location.search,
  subscription: state.subscription,
  device: state.device,
  profile: state.profile,
});

export default connect(stateToProps)(Prime);
