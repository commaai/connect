import { claimMailto, claimTotalCents, claimableReferrals } from './utils';

const referrals = [
  { status: 'claim', reward_cents: 5000, order_name: '#1', order_id: 'one' },
  { status: 'pending', reward_cents: 5000, order_name: '#2', order_id: 'two' },
  { status: 'claim', reward_cents: 5000, order_name: '#3', order_id: 'three' },
];

test('builds one claim for all eligible referrals', () => {
  expect(claimableReferrals(referrals)).toHaveLength(2);
  expect(claimTotalCents(referrals)).toBe(10000);
  const url = decodeURIComponent(claimMailto({ email: 'me@example.com', user_id: 'abc' }, 'COMMA-ABC', referrals));
  expect(url).toContain('support@comma.ai');
  expect(url).toContain('#1 (one)');
  expect(url).toContain('#3 (three)');
  expect(url).not.toContain('#2 (two)');
  expect(url).toContain('$100.00');
});
