import { connect } from 'react-redux';

import { Typography } from '@material-ui/core';
import PrimeManage from './PrimeManage';
import PrimeCheckout from './PrimeCheckout';

const Prime = (props) => {
  const { device, profile, stripeSuccess, stripeCancelled } = props;
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
  stripeSuccess: state.navigation.stripeSuccess,
  stripeCancelled: state.navigation.stripeCancelled,
  device: state.device,
  profile: state.profile,
});

export default connect(stateToProps)(Prime);
