export function referralTotals(referrals) {
  const totals = {
    claimable: { count: 0, reward_dollars: 0, referrals: [] },
    pending: { count: 0, reward_dollars: 0, referrals: [] },
    claimed: { count: 0, reward_dollars: 0, referrals: [] },
  };

  referrals.forEach((referral) => {
    const category = referral.status === 'claim' ? 'claimable' : referral.status;
    if (!totals[category]) return;
    totals[category].count += 1;
    totals[category].reward_dollars += Number(referral.reward_dollars || 0);
    totals[category].referrals.push(referral);
  });
  return totals;
}

export function claimMailto(profile, code, claimable) {
  const amount = Number(claimable.reward_dollars || 0).toFixed(2);
  const orders = claimable.referrals.map(({ order_name }) => `- ${order_name}`).join('\n');
  const subject = 'Referral Claim';
  const body = `Hi comma support,\n\nI would like to claim $${amount} cash for ${claimable.count} referral${claimable.count === 1 ? '' : 's'}:\n${orders}\n\nAccount: ${profile.email} (${profile.user_id})\nReferral coupon: ${code}\n\nThanks!`;
  return `mailto:support@comma.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
