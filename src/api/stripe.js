import { loadStripe } from '@stripe/stripe-js';

const stripe = loadStripe(process.env.REACT_APP_STRIPE_TOKEN);

export default stripe;