import { useSyncExternalStore } from 'react';

const CHANGED = 'prime-promotion-dismissed';
const keyFor = dongleId => `prime-promotion-dismissed:${dongleId}`;

function subscribe(listener) {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGED, listener);
  };
}

export function dismissPrimePromotion(dongleId) {
  if (!dongleId) return;
  window.localStorage.setItem(keyFor(dongleId), 'true');
  window.dispatchEvent(new Event(CHANGED));
}

export function usePrimePromotionDismissed(dongleId) {
  return useSyncExternalStore(subscribe, () => (
    Boolean(dongleId && window.localStorage.getItem(keyFor(dongleId)) === 'true')
  ));
}
