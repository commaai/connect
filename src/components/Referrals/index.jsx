import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import * as Sentry from '@sentry/react';
import {
  Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
} from '@material-ui/core';

import { billing } from '../../api';
import { ContentCopy } from '../../icons';
import { claimMailto } from './utils';

const REFERRAL_URL = import.meta.env.VITE_REFERRAL_URL || 'https://refer.comma.ai';
const referralUrl = (code) => `${REFERRAL_URL.replace(/\/$/, '')}/${encodeURIComponent(code)}`;

const referralSteps = [
  {
    title: 'Share your link',
    detail: 'Send it to a friend who is interested in a comma four.',
  },
  {
    title: 'They save $50',
    detail: 'Your link takes $50 off their comma four order.',
  },
  {
    title: 'You earn $50 cash',
    detail: 'Every successful referral puts $50 in your pocket.',
  },
];

export default function Referrals({ profile }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [shareStatus, setShareStatus] = useState(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [claimOpening, setClaimOpening] = useState(false);
  const claimOpeningTimer = useRef(null);
  const shareUrl = summary ? referralUrl(summary.code) : null;

  useEffect(() => () => window.clearTimeout(claimOpeningTimer.current), []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

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

  const copyLink = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setShareStatus('copied');
  };

  const shareLink = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: 'Give $50, Get $50 with comma',
        text: 'Get $50 off your comma four purchase using my referral link.',
        url: shareUrl,
      });
      setShareStatus('shared');
      window.setTimeout(() => setShareStatus(null), 1500);
    } catch (err) {
      // Closing the native share sheet is expected and does not need reporting.
      if (err?.name !== 'AbortError') {
        Sentry.captureException(err, { fingerprint: 'referrals_navigator_share' });
        try {
          await copyLink();
        } catch (copyError) {
          setShareStatus('unable to share');
          window.setTimeout(() => setShareStatus(null), 2000);
          Sentry.captureException(copyError, { fingerprint: 'referrals_clipboard_copy' });
        }
      }
    }
  };

  const openClaim = (event) => {
    if (claimOpening) {
      event.preventDefault();
      return;
    }
    setClaimOpening(true);
    claimOpeningTimer.current = window.setTimeout(() => setClaimOpening(false), 1500);
  };

  const claimableReferrals = useMemo(
    () => (summary?.referrals || []).filter(({ status }) => status === 'claim'),
    [summary],
  );

  if (error) return (
    <main className="max-w-[430px] mx-5 my-1.5 min-[521px]:mx-6 min-[521px]:my-[18px] text-white">
      <p>{error.message}</p>
      {error.retryable && (
        <button type="button" onClick={loadReferrals} className="mt-4 h-[42px] rounded-full bg-white px-5 font-semibold text-[#16181a]">
          Retry
        </button>
      )}
    </main>
  );
  if (!summary) return (
    <main className="flex w-full flex-1 items-center justify-center text-white">
      <CircularProgress aria-label="Loading referrals" size={40} style={{ color: 'white' }} />
    </main>
  );

  return (
    <main className="w-[calc(100%-40px)] max-w-[430px] mx-5 mb-3 min-[521px]:w-[calc(100%-48px)] min-[521px]:mx-6 min-[521px]:my-[18px] text-white">
      <h1 className="my-10 whitespace-nowrap text-[clamp(2.5rem,12.5vw,4rem)] font-bold leading-none tracking-[-0.055em]">
        Refer a friend, <br></br>
        Get $50.
      </h1>

      <section>
        <ol>
          {referralSteps.map((step, index) => (
            <li key={step.title} className="group relative flex gap-3.5 pb-[18px] last:pb-0">
              <div className="relative z-10 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white text-base font-bold leading-none text-[#16181a]">
                {index + 1}
              </div>
              <div className="min-w-0 pt-0.5">
                <span className="sr-only">Step {index + 1}: </span>
                <h2 className="text-base font-bold leading-snug text-white">{step.title}</h2>
                <p className="mt-0.5 text-xs leading-[1.45] text-white/55">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <button
          type="button"
          onClick={shareLink}
          className="h-[52px] w-full rounded-full border border-white bg-white px-6 font-bold text-[#16181a] transition duration-150 hover:scale-[1.02] hover:bg-white/90 active:scale-[0.98]"
        >
          <span>
            {shareStatus || 'share your link'}
          </span>
        </button>
        <div className="mt-2.5 flex items-center justify-center gap-1.5 px-4 text-[11px] leading-4 text-white/45">
          <span className="min-w-0 truncate">
            {shareUrl}
          </span>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy referral link"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15"
          >
            <ContentCopy aria-hidden="true" className="!h-3.5 !w-3.5" />
          </button>
        </div>
      </section>
      <Dialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        aria-labelledby="referral-terms-title"
        fullWidth
        maxWidth="xs"
        PaperProps={{ className: '!mx-8 !w-[calc(100%-64px)] !max-w-[430px] !bg-[#242729] !text-white' }}
      >
        <DialogTitle id="referral-terms-title" className="!text-white">Referral terms and conditions</DialogTitle>
        <DialogContent>
          <div className="space-y-3 text-sm leading-relaxed text-white/80">
            <p>Referral rewards are available to eligible comma customers who share their unique referral link.</p>
            <p>A referral qualifies when a new customer uses that link to purchase a comma four and keeps the order for at least 30 days. Rewards become available to claim 30 days after the order is placed. Cancelled, returned, refunded, fraudulent, or self-referred orders do not qualify.</p>
            <p>Each qualifying referral provides $50 off the referred customer’s order and a $50 cash reward for the referrer. Each referral code is limited to 10 uses. If you would like to refer more than 10 people, message <a className="text-white underline" href="mailto:community@comma.ai">community@comma.ai</a>.</p>
            <p>comma may limit, suspend, or change the referral program, or withhold rewards where misuse is suspected. Referral rewards have no cash value until approved and paid.</p>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTermsOpen(false)} className="!text-white">Close</Button>
        </DialogActions>
      </Dialog>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Your Referrals Summary</h2>

        <div className="mt-3 overflow-hidden rounded-[14px] bg-white/5">
          <dl className="divide-y divide-white/10">
            <div className="flex items-center justify-between gap-4 px-[15px] py-[13px]">
              <dt className="text-[13px] text-white/60">Already claimed:</dt>
              <dd className="text-lg font-bold">${summary.cash.claimed.toFixed(0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-[15px] py-[13px]">
              <dt className="text-[13px] text-white/60">Pending rewards:</dt>
              <dd className="text-lg font-bold">${summary.cash.pending.toFixed(0)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-[15px] py-[13px]">
              <dt className="text-[13px] text-white/60">Available to claim:</dt>
              <dd className={`text-lg font-bold ${summary.cash.available > 0 ? 'text-green-300' : ''}`}>
                ${summary.cash.available.toFixed(0)}
              </dd>
            </div>
          </dl>

        </div>
        {summary.cash.available > 0 && claimableReferrals.length > 0 && profile ? (
          <a
            href={claimMailto(profile, summary.code, claimableReferrals, summary.cash.available)}
            onClick={openClaim}
            aria-disabled={claimOpening}
            className={`mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full border border-white bg-white px-6 text-center text-lg font-bold text-[#16181a] transition duration-150 ${claimOpening ? 'cursor-wait opacity-80' : 'hover:scale-[1.02] hover:bg-white/90 active:scale-[0.98]'}`}
          >
            {claimOpening ? (
              <>
                <CircularProgress size={20} aria-hidden="true" style={{ color: '#16181a' }} />
                Opening mail app…
              </>
            ) : `claim rewards ($${summary.cash.available.toFixed(0)})`}
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="mt-4 h-14 w-full cursor-not-allowed rounded-full border border-white/10 bg-white/10 px-6 text-lg font-bold text-white/35"
          >
            claim rewards (${summary.cash.available.toFixed(0)})
          </button>
        )}
      </section>
      <p className="mt-3 text-center text-xs text-white/50">
        Referrals are limited to 10 usages. They are also subject to certain{' '}
        <button
          type="button"
          className="cursor-pointer bg-transparent p-0 text-inherit underline underline-offset-2"
          onClick={() => setTermsOpen(true)}
        >
          terms
        </button>
        .
      </p>
    </main>
  );
}
