import { loadStripe } from '@stripe/stripe-js';

let STRIPE_PUBLISHABLE_KEY;
if (process.env.NODE_ENV !== 'production') {
  STRIPE_PUBLISHABLE_KEY = 'pk_test_jn26O6Fvi063fJIM1z7xuydB';
} else {
  STRIPE_PUBLISHABLE_KEY = 'pk_live_kvdUcYAUBDxAWUs8xnBgNqkC';
}
const stripe = loadStripe(STRIPE_PUBLISHABLE_KEY);

export default stripe;