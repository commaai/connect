import { Typography } from '@material-ui/core';
import { useSelector } from 'react-redux';
import PrimeCheckout from './PrimeCheckout';
import PrimeManage from './PrimeManage';

const Prime = () => {
  const device = useSelector((state) => state.device);
  const profile = useSelector((state) => state.profile);

  let stripeCancelled;
  let stripeSuccess;
  if (window.location) {
    const params = new URLSearchParams(window.location.search);
    stripeCancelled = params.get('stripe_cancelled');
    stripeSuccess = params.get('stripe_success');
  }
  if (!profile) {
    return null;
  }

  if (!device.is_owner && !profile.superuser) {
    return <Typography>No access</Typography>;
  }
  if (device.prime || stripeSuccess) {
    return <PrimeManage stripeSuccess={stripeSuccess} />;
  }
  return <PrimeCheckout stripeCancelled={stripeCancelled} />;
};

export default Prime;
