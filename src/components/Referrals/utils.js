export function claimableReferrals(referrals) {
  return referrals.filter((referral) => referral.status === 'claim');
}

export function claimTotalCents(referrals) {
  return claimableReferrals(referrals)
    .reduce((total, referral) => total + referral.reward_cents, 0);
}

export function claimMailto(profile, code, referrals) {
  const claimable = claimableReferrals(referrals);
  const amount = (claimTotalCents(claimable) / 100).toFixed(2);
  const orders = claimable.map((referral) => `- ${referral.order_name} (${referral.order_id})`).join('\n');
  const subject = `Referral claim: ${code}`;
  const body = `Hi comma support,\n\nI want to claim $${amount} cash for these referrals:\n${orders}\n\nAccount: ${profile.email} (${profile.user_id})\nReferral coupon: ${code}\n\nThanks!`;
  return `mailto:support@comma.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
