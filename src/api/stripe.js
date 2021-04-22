import stripe from '@commaai/tipsi-stripe';
let STRIPE_PUBLISHABLE_KEY;
if (__DEV__) {
  STRIPE_PUBLISHABLE_KEY = 'pk_test_jn26O6Fvi063fJIM1z7xuydB';
} else {
  STRIPE_PUBLISHABLE_KEY = 'pk_live_kvdUcYAUBDxAWUs8xnBgNqkC';
}
stripe.setOptions({
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  merchantId: 'merchant.ai.comma',
  androidPayMode: 'test',
})

export async function tokenizeNativePay(opts = {}) {
  let items = [{
    currency_code: 'USD',
    label: opts.label || 'comma prime monthly',
    description: opts.description || 'comma prime monthly',
    amount: '24.00',
    total_price: '24.00',
    unit_price: '24.00',
    quantity: "1"
  }];
  return await stripe.paymentRequestWithNativePay(
    {total_price: '24.00', currency_code: 'USD', line_items: items},
    items
  );
}

export async function tokenizeCard(card) {
  let { number, cvc } = card.values;
  number = number.toString();
  cvc = cvc.toString();
  let [ expMonth, expYear ] = card.values.expiry.split('/');
  expMonth = parseInt(expMonth);
  expYear = parseInt(expYear);

  return await stripe.createTokenWithCard({number, expMonth, expYear, cvc })
}

export default stripe;