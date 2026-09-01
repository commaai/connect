import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import * as Sentry from '@sentry/react';
import { CircularProgress } from '@material-ui/core';
import posthog from 'posthog-js';

import { api } from '../../api/backend';
import { ContentCopy } from '../../icons';
import { isMobileDevice } from '../../utils/browser';
import { claimMailto, referralUrl } from './utils';

const REFERRAL_URL = import.meta.env.VITE_REFERRAL_URL || 'https://refer.comma.ai';

const referralSteps = [
  {
    title: 'Share your link',
    detail: 'Send it to a friend who is interested in comma four.',
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
  const [claimOpening, setClaimOpening] = useState(false);
  const claimOpeningTimer = useRef(null);
  const shareStatusTimer = useRef(null);
  const plateRef = useRef(null);
  const glareRef = useRef(null);
  const shareUrl = summary ? referralUrl(REFERRAL_URL, summary.code) : null;

  useEffect(() => () => {
    window.clearTimeout(claimOpeningTimer.current);
    window.clearTimeout(shareStatusTimer.current);
  }, []);

  useEffect(() => {
    posthog.capture('referrals_page_visit');
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const loadReferrals = useCallback(async () => {
    setError(null);
    try {
      const nextSummary = await api.billing.getReferrals();
      if (!nextSummary) throw new Error('Referral request returned no data');
      setSummary(nextSummary);
    } catch (err) {
      const forbidden = err?.resp?.status === 403;
      setError({
        message: forbidden
          ? 'Referrals are only available for comma device owners'
          : 'Could not load referrals. Please try again.',
        retryable: !forbidden,
      });
      Sentry.captureException(err, { fingerprint: 'referrals_load' });
    }
  }, []);

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
    window.clearTimeout(shareStatusTimer.current);
    shareStatusTimer.current = window.setTimeout(() => setShareStatus(null), 2000);
  };

  const shareLink = async () => {
    posthog.capture('referrals_copy_button_click', { source: 'share_button' });
    if (!navigator.share || !isMobileDevice()) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: 'Give $50, Get $50 with comma',
        text: 'Get $50 off comma four using this referral link.',
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

  // Tilts the plate toward the cursor while it is hovered; the transform is
  // written straight to the node so pointer movement does not re-render.
  const tiltPlate = (event) => {
    const plate = plateRef.current;
    if (!plate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Each axis spans -0.5..0.5 across the plate; the pitch is tilted harder
    // than the yaw so the short vertical travel still reads as a real tilt.
    const bounds = plate.getBoundingClientRect();
    const fromCenterX = ((event.clientX - bounds.left) / bounds.width) - 0.5;
    const fromCenterY = ((event.clientY - bounds.top) / bounds.height) - 0.5;
    plate.style.transitionDuration = '90ms';
    plate.style.transform = `perspective(900px) rotateY(${(fromCenterX * 13).toFixed(2)}deg) rotateX(${(fromCenterY * -24).toFixed(2)}deg) scale(1.02)`;
    const glare = glareRef.current;
    if (glare) {
      glare.style.setProperty('--glare-x', `${((fromCenterX + 0.5) * 100).toFixed(1)}%`);
      glare.style.setProperty('--glare-y', `${((fromCenterY + 0.5) * 100).toFixed(1)}%`);
      glare.style.opacity = '1';
    }
  };

  const restPlate = () => {
    const plate = plateRef.current;
    if (!plate) return;
    plate.style.transitionDuration = '';
    plate.style.transform = '';
    if (glareRef.current) glareRef.current.style.opacity = '0';
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
    () => (summary?.referrals || []).filter(({ status }) => status === 'available'),
    [summary],
  );
  const displayedSummary = summary || {
    cash: { available: 0, claimed: 0, pending: 0 },
  };

  return (
    <main className="mx-auto mb-4 w-[calc(100%-40px)] max-w-[430px] min-[521px]:w-[calc(100%-48px)] min-[1081px]:mx-6 text-white">
      <h1 className="my-8 text-[clamp(2.5rem,12.5vw,4rem)] font-bold leading-none tracking-[-0.055em]">
        Refer a friend, <br></br>
        Get $50.
      </h1>

      <section>
        <ol>
          {referralSteps.map((step, index) => (
            <li key={step.title} className="group relative flex gap-3.5 pb-[18px] last:pb-0">
              <div className="relative z-10 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white text-base font-bold leading-none text-[#16181a]">
                <span className={`block leading-[0.75] ${index === 0 ? 'relative -left-px' : ''}`}>{index + 1}</span>
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

      <section className="relative mt-7">
        {!error && (
          <div className={!summary ? 'invisible pointer-events-none' : ''} aria-hidden={!summary || undefined}>
            <button
              type="button"
              onClick={shareLink}
              disabled={!summary}
              aria-label={`Share your referral link, code ${summary?.code || ''}`}
              onMouseMove={tiltPlate}
              onMouseLeave={restPlate}
              className="group block w-full cursor-pointer select-none"
            >
              <div
                ref={plateRef}
                className="relative mx-auto w-full max-w-[330px] rounded-[19px] bg-gradient-to-b from-white/30 to-white/5 p-[2px] shadow-[0_0_40px_-6px_rgba(255,255,255,0.18),0_20px_40px_-20px_rgba(0,0,0,0.95)] transition-transform duration-300 ease-out group-active:scale-[0.99]"
              >
                <div className="relative overflow-hidden rounded-[17px] bg-gradient-to-b from-[#1e2123] via-[#141617] to-[#000000] px-5 pb-3 pt-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-6px_16px_rgba(0,0,0,0.8)]">
                  <div aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-[10px] border border-white/12" />
                  <div
                    ref={glareRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 transition-opacity duration-300 ease-out"
                    style={{
                      opacity: 0,
                      background: 'radial-gradient(200px circle at var(--glare-x, 50%) var(--glare-y, 50%), rgba(255,255,255,0.07), transparent 65%)',
                    }}
                  />
                  <span aria-hidden="true" className="absolute left-[23%] top-2.5 h-[9px] w-[9px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.15)]" />
                  <span aria-hidden="true" className="absolute right-[23%] top-2.5 h-[9px] w-[9px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.15)]" />

                  <p className="relative text-center text-[10px] font-semibold uppercase leading-4 tracking-[0.3em] text-white/45">
                    comma.ai
                  </p>
                  <p className="relative mt-0.5 text-center text-[clamp(2rem,11.5vw,3.25rem)] font-black uppercase leading-[1.1] tracking-[0.06em] text-[#51ff00] [text-shadow:0_0_18px_rgba(81,255,0,0.35),0_2px_4px_rgba(0,0,0,0.9)]">
                    {summary?.code || '\u00a0'}
                  </p>
                  <p className="relative mt-0.5 text-center text-[9px] font-semibold uppercase leading-4 tracking-[0.28em] text-white/35">
                    referral code
                  </p>

                  <span
                    aria-hidden="true"
                    className={`absolute right-2.5 top-2 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#16181a] transition-opacity duration-150 ${shareStatus ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {shareStatus || 'copied'}
                  </span>
                </div>
              </div>
            </button>

            <div className="mt-4 flex justify-center px-4">
              <button
                type="button"
                onClick={() => {
                  posthog.capture('referrals_copy_button_click', { source: 'copy_icon' });
                  copyLink();
                }}
                aria-label="Copy referral link"
                className="flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-4 pr-3 text-[12px] leading-4 text-white/50 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/80"
              >
                <span className="min-w-0 truncate">
                  {shareUrl}
                </span>
                <ContentCopy aria-hidden="true" className="!h-3.5 !w-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}
        {!summary && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <CircularProgress aria-label="Loading referral link" size={28} style={{ color: 'white' }} />
          </div>
        )}
        {error && (
          <p className="py-4 text-center text-sm text-white/55">Your share link is unavailable.</p>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Your Referrals</h2>

        <div className="relative mt-3">
          {error && (
            <div className="rounded-[14px] bg-white/5 p-4 text-center">
              <p>{error.message}</p>
              {error.retryable && (
                <button type="button" onClick={loadReferrals} className="mt-4 cursor-pointer h-[42px] rounded-full bg-white px-5 font-semibold text-[#16181a]">
                  Retry
                </button>
              )}
            </div>
          )}
          {!error && (
            <div className={!summary ? 'invisible pointer-events-none' : ''} aria-hidden={!summary || undefined}>
            <div className="overflow-hidden rounded-[14px] bg-white/5">
              <dl className="divide-y divide-white/10">
                <div className="flex items-center justify-between gap-4 px-[15px] py-[13px]">
                  <dt className="text-[13px] text-white/60">Already claimed:</dt>
                  <dd className="text-lg font-bold">${displayedSummary.cash.claimed.toFixed(0)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-[15px] py-[13px]">
                  <dt className="text-[13px] text-white/60">Pending rewards:</dt>
                  <dd className="text-lg font-bold">${displayedSummary.cash.pending.toFixed(0)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-[15px] py-[13px]">
                  <dt className="text-[13px] text-white/60">Available to claim:</dt>
                  <dd className={`text-lg font-bold ${displayedSummary.cash.available > 0 ? 'text-green-300' : ''}`}>
                    ${displayedSummary.cash.available.toFixed(0)}
                  </dd>
                </div>
              </dl>

            </div>
            {summary && summary.cash.available > 0 && claimableReferrals.length > 0 && profile ? (
              <a
                href={claimMailto(profile, summary.code, claimableReferrals, summary.cash.available)}
                onClick={openClaim}
                aria-disabled={claimOpening}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white bg-white px-6 py-4 text-center text-lg font-bold text-[#16181a] transition duration-150 ${claimOpening ? 'cursor-wait opacity-80' : 'cursor-pointer hover:scale-[1.02] hover:bg-white/90 active:scale-[0.98]'}`}
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
                className="mt-4 w-full cursor-not-allowed rounded-full border border-white/10 bg-white/10 px-6 py-4 text-lg font-bold text-white/35"
              >
                claim rewards (${displayedSummary.cash.available.toFixed(0)})
              </button>
            )}
            </div>
          )}
          {!summary && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CircularProgress aria-label="Loading your referrals" size={32} style={{ color: 'white' }} />
            </div>
          )}
        </div>
      </section>
      <p className="mt-3 text-center text-xs text-white/50">
        Referral rewards become available to claim after each order's return period ends.
      </p>
      <p className="mt-3 text-center text-xs text-white/50">
        Referrals are subject to{' '}
        <a
          href="https://comma.ai/terms#referral-terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-inherit underline underline-offset-2"
        >
          terms and conditions
        </a>
        .
      </p>
    </main>
  );
}
