export function otherPrimePlan(plan) {
  return plan === 'data' ? 'nodata' : 'data';
}

export function primePlanName(plan) {
  return plan === 'data' ? 'Standard' : 'Lite';
}
