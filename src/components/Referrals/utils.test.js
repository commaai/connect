import { claimMailto } from './utils';

const referrals = [
  { status: 'claim' },
  { status: 'pending' },
  { status: 'claim' },
  { status: 'claimed' },
  { status: 'cancelled' },
];

test('builds one claim for all eligible referrals', () => {
  const claimable = referrals.filter(({ status }) => status === 'claim');
  const url = decodeURIComponent(claimMailto(
    { email: 'me@example.com', user_id: 'abc' },
    'COMMA-ABC',
    claimable,
    100,
  ));
  expect(url).toContain('support@comma.ai');
  expect(url).toContain('2 referrals');
  expect(url).toContain('$100.00');
  expect(url).toContain('Account: me@example.com (abc)');
  expect(url).toContain('Referral coupon: COMMA-ABC');
});
