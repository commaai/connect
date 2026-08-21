export function claimMailto(profile, code, referrals, availableCash) {
  const amount = Number(availableCash || 0).toFixed(2);
  const subject = 'Referral Claim';
  const body = `Hi comma support,\n\nI would like to claim $${amount} cash for ${referrals.length} referral${referrals.length === 1 ? '' : 's'}.\n\nAccount: ${profile.email} (${profile.user_id})\nReferral coupon: ${code}\n\nThanks!`;
  return `mailto:support@comma.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
