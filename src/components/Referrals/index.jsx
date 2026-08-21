import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react';
import { IconButton } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';

import { billing } from '../../api';
import { claimMailto, claimTotalCents, claimableReferrals } from './utils';

const statusStyle = {
  pending: 'bg-yellow-500/15 text-yellow-300',
  cancelled: 'bg-red-500/15 text-red-300',
  returned: 'bg-red-500/15 text-red-300',
  claimed: 'bg-blue-500/15 text-blue-300',
  claim: 'bg-green-500/15 text-green-300',
};

const statusLabel = {
  pending: 'Pending', cancelled: 'Cancelled', returned: 'Returned', claimed: 'Claimed', claim: 'Ready to claim',
};
const historicalStatuses = ['cancelled', 'returned', 'claimed'];
const referralWaitMilliseconds = 60 * 24 * 60 * 60 * 1000;

export default function Referrals({ profile, onBack }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadReferrals = useCallback(async () => {
    setError(null);
    try {
      const nextSummary = await billing.createReferralCode();
      if (!nextSummary) throw new Error('Referral request returned no data');
      setSummary(nextSummary);
    } catch (err) {
      const forbidden = err?.resp?.status === 403;
      setError({
        message: forbidden
          ? 'Referrals are only available for comma four owners'
          : 'Could not load your referral program. Please try again.',
        retryable: !forbidden,
      });
      Sentry.captureException(err, { fingerprint: 'referrals_load' });
    }
  }, []);

  // Start the request before painting the loading state. This also avoids a
  // passive-effect scheduling gap where the page can say "Loading" without a
  // billing request having been sent yet.
  useLayoutEffect(() => {
    loadReferrals();
  }, [loadReferrals]);

  const claimable = useMemo(() => claimableReferrals(summary?.referrals || []), [summary]);
  const totalCents = useMemo(() => claimTotalCents(summary?.referrals || []), [summary]);
  const referralsByOrderDate = useMemo(
    () => [...(summary?.referrals || [])].sort((a, b) => b.ordered_at - a.ordered_at),
    [summary],
  );
  const activeReferrals = useMemo(
    () => referralsByOrderDate.filter((referral) => !historicalStatuses.includes(referral.status)),
    [referralsByOrderDate],
  );
  const oldReferrals = useMemo(
    () => referralsByOrderDate.filter((referral) => historicalStatuses.includes(referral.status)),
    [referralsByOrderDate],
  );

  const copyLink = async () => {
    await navigator.clipboard.writeText(summary.referral_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (error) return (
    <main className="max-w-[430px] mx-3 my-1.5 min-[521px]:mx-6 min-[521px]:my-[18px] text-white">
      <p>{error.message}</p>
      {error.retryable && (
        <button type="button" onClick={loadReferrals} className="mt-4 h-[42px] rounded-full bg-white px-5 font-semibold text-[#16181a]">
          Retry
        </button>
      )}
    </main>
  );
  if (!summary) return <main className="max-w-[430px] mx-3 my-1.5 min-[521px]:mx-6 min-[521px]:my-[18px] text-white"><p>Loading referrals…</p></main>;

  return (
    <main className="w-[calc(100%-24px)] max-w-[430px] mx-3 my-1.5 min-[521px]:w-[calc(100%-48px)] min-[521px]:mx-6 min-[521px]:my-[18px] text-white">
      <IconButton aria-label="Go Back" onClick={onBack}>
        <KeyboardBackspaceIcon />
      </IconButton>
      <h1 className="text-2xl font-semibold">Refer a friend, Get $50.</h1>
      <p className="mt-2 text-sm text-white/70">You get $50 cash, your friend gets $50 off at checkout. <br></br>Your reward becomes claimable 60 days after their order.</p>

      <section className="mt-6 rounded-xl bg-white/8 p-4">
        <label className="block text-sm text-white/50 mb-2">Your referral link</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input readOnly value={summary.referral_url} className="min-w-0 h-[42px] flex-1 rounded-[20px] bg-black/20 px-4 text-white" />
          <button onClick={copyLink} className="h-[42px] rounded-full bg-white text-[#16181a] font-semibold px-5">
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="mt-2 text-xs text-white/40">Discount Code: {summary.code}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Your referrals</h2>

        {claimable.length > 0 && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl bg-white/10 p-4">
            <div>
              <p className="text-sm text-white/50">Ready to claim</p>
              <p className="text-2xl font-bold">${(totalCents / 100).toFixed(2)}</p>
            </div>
            <a
              href={claimMailto(profile, summary.code, summary.referrals)}
              className="flex h-[42px] items-center justify-center rounded-full bg-white px-6 text-center font-semibold text-[#16181a]"
            >
              Claim {claimable.length} referral{claimable.length === 1 ? '' : 's'}
            </a>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {activeReferrals.length === 0 && <p className="rounded-xl bg-white/5 p-4 text-white/50">No referrals yet.</p>}
          {activeReferrals.map((referral) => (
            <article key={referral.order_id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-4">
              <div>
                <p className="mt-1 text-sm text-white/50">
                  Order date: {new Date(referral.ordered_at * 1000).toLocaleDateString()}
                </p>
                {referral.status === 'pending' && (
                  <p className="mt-1 text-sm text-white/50">
                    Expected claim date: {new Date(referral.ordered_at * 1000 + referralWaitMilliseconds).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className={`rounded-full px-3 py-1 text-sm ${statusStyle[referral.status]}`}>
                {statusLabel[referral.status]}
              </span>
            </article>
          ))}
        </div>
      </section>

      {oldReferrals.length > 0 && (
        <details className="group mt-6">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between rounded-xl bg-white/5 p-4">
            <h2 className="text-base font-semibold">Referral history</h2>
            <span aria-hidden="true" className="text-white/50 transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="mt-3 space-y-3">
            {oldReferrals.map((referral) => (
              <article key={referral.order_id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-4">
                <div>
                  <p className="mt-1 text-sm text-white/50">
                    Order date: {new Date(referral.ordered_at * 1000).toLocaleDateString()}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm ${statusStyle[referral.status]}`}>
                  {statusLabel[referral.status]}
                </span>
              </article>
            ))}
          </div>
        </details>
      )}
    </main>
  );
}
