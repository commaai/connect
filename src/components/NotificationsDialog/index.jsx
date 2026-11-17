import React, { useEffect, useState } from 'react';

import { AccountIcon, NotificationsIcon } from '../../icons';

const FADE_OUT_MS = 250;

const buttonClass = 'flex h-14 w-full items-center justify-center rounded-full text-lg font-semibold cursor-pointer';
const primaryButtonClass = `${buttonClass} bg-white text-black hover:bg-[#eee]`;
const secondaryButtonClass = `${buttonClass} text-white hover:bg-white/10`;

const NotificationsDialog = ({ open, onAllow, onDismiss }) => {
  const [shown, setShown] = useState(open);
  const leaving = !open && shown;

  useEffect(() => {
    if (open) {
      setShown(true);
      return undefined;
    }
    const timer = setTimeout(() => setShown(false), FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!shown) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [shown]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!shown) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      className={`fixed inset-0 z-[1400] overflow-y-auto overscroll-contain bg-[#1D2225] ${
        leaving
          ? 'pointer-events-none opacity-0 transition-opacity duration-[250ms] ease-in'
          : 'animate-[fadein_0.5s_ease-out_0.3s_backwards]'
      }`}
    >
      <div className="flex min-h-full flex-col items-center px-10 pt-[calc(env(safe-area-inset-top)+48px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center">
          <div className="flex w-full flex-col items-center text-center">
            <div className="flex h-21 w-21 shrink-0 items-center justify-center rounded-2xl bg-[#1e2224] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              <NotificationsIcon className="h-11 w-11 text-white" />
            </div>
            <h1 id="notifications-title" className="mt-10 text-[32px] font-extrabold leading-tight text-white">
              Turn on notifications
            </h1>
            <p className="mt-4 text-lg text-white/70">
              Get occasional notifications about the latest openpilot updates and news.
            </p>
          </div>
          <div className="mt-10 flex w-full flex-col items-center gap-3">
            <button type="button" className={primaryButtonClass} onClick={onAllow}>
              Turn on
            </button>
            <button type="button" className={secondaryButtonClass} onClick={onDismiss}>
              Not now
            </button>
          </div>
        </div>
        <p className="mt-10 max-w-sm text-center text-sm text-white/50">
          You can manage notifications at any time in the account settings menu{' '}
          <AccountIcon className="ml-0.5 inline-block h-5 w-5 align-text-bottom text-white/70" aria-hidden="true" />
        </p>
      </div>
    </div>
  );
};

export { default as NotificationsHelpDialog } from './NotificationsHelpDialog';
export default NotificationsDialog;
