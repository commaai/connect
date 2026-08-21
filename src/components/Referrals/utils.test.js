import { claimMailto, referralTotals } from './utils';

const referrals = [
  { status: 'claim', reward_dollars: 50, order_name: '#1001' },
  { status: 'pending', reward_dollars: 50, order_name: '#1002' },
  { status: 'claim', reward_dollars: 50, order_name: '#1003' },
  { status: 'claimed', reward_dollars: 50, order_name: '#1004' },
  { status: 'cancelled', reward_dollars: 50, order_name: '#1005' },
];

test('calculates referral totals by status', () => {
  const totals = referralTotals(referrals);
  expect(totals.claimable).toMatchObject({ count: 2, reward_dollars: 100 });
  expect(totals.pending).toMatchObject({ count: 1, reward_dollars: 50 });
  expect(totals.claimed).toMatchObject({ count: 1, reward_dollars: 50 });
});

test('builds one claim for all eligible referrals', () => {
  const url = decodeURIComponent(claimMailto(
    { email: 'me@example.com', user_id: 'abc' },
    'COMMA-ABC',
    referralTotals(referrals).claimable,
  ));
  expect(url).toContain('support@comma.ai');
  expect(url).toContain('2 referrals');
  expect(url).toContain('$100.00');
  expect(url).toContain('- #1001');
  expect(url).toContain('- #1003');
  expect(url).not.toContain('#1002');
});
