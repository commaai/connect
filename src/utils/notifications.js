import { request } from '../api';
import { deleteFcmToken, getFcmToken } from './firebase';

const PROMPT_DISMISSED_KEY = 'notificationsPromptDismissed';
const DISABLED_KEY = 'notificationsDisabled';
const REGISTERED_TOKEN_KEY = 'notificationsRegisteredToken';
const REREGISTER_MS = 7 * 24 * 60 * 60 * 1000;

function load(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    if (value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore
  }
}

function notificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function getPlatform() {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

export function notificationsAvailable() {
  return isStandalone() && notificationsSupported();
}

export function notificationsDenied() {
  return notificationsSupported() && Notification.permission === 'denied';
}

export function notificationsEnabled() {
  return notificationsSupported() && Notification.permission === 'granted' && !load(DISABLED_KEY);
}

export function shouldPromptForNotifications() {
  return notificationsAvailable() && Notification.permission === 'default' && !load(PROMPT_DISMISSED_KEY);
}

export function dismissNotificationsPrompt() {
  save(PROMPT_DISMISSED_KEY, true);
}

export function enableNotifications() {
  save(DISABLED_KEY, null);
  return Notification.requestPermission();
}

export async function unsubscribeFromPush() {
  save(REGISTERED_TOKEN_KEY, null);
  if (!notificationsSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!(await registration?.pushManager.getSubscription())) return;
  await deleteFcmToken(registration);
}

export async function disableNotifications() {
  save(DISABLED_KEY, true);
  await unsubscribeFromPush();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js')
    .catch((err) => console.error('Service worker registration failed:', err));
}

export async function subscribeToPush() {
  if (!notificationsEnabled()) return;
  const token = await getFcmToken(await navigator.serviceWorker.ready);
  if (!token) return;

  const registered = load(REGISTERED_TOKEN_KEY);
  if (registered?.token !== token || Date.now() - registered.at > REREGISTER_MS) {
    await request.request('POST', 'v1/me/notifications/subscribe', { token }, true, true, true);
    save(REGISTERED_TOKEN_KEY, { token, at: Date.now() });
  }
}
