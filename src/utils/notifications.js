import { request } from '../api';
import { getFirebaseMessaging } from './firebase';

const PROMPT_DISMISSED_KEY = 'notificationsPromptDismissed';
const DISABLED_KEY = 'notificationsDisabled';
const REGISTERED_TOKEN_KEY = 'notificationsRegisteredToken';

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
  } catch {}
}

function notificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// 'default' (not asked yet), 'granted', 'denied', or 'unsupported'
export function getNotificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function getPlatform(navigatorLike = navigator) {
  const ua = navigatorLike.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigatorLike.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

export function notificationsAvailable() {
  return isStandalone() && notificationsSupported();
}

export function dismissNotificationsPrompt() {
  save(PROMPT_DISMISSED_KEY, true);
}

export function notificationsEnabled() {
  return getNotificationPermission() === 'granted' && !load(DISABLED_KEY);
}

export async function enableNotifications() {
  save(DISABLED_KEY, null);
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export async function disableNotifications() {
  save(DISABLED_KEY, true);
  await unsubscribeFromPush();
}

export async function resetNotificationsState() {
  save(PROMPT_DISMISSED_KEY, null);
  save(DISABLED_KEY, null);
  await unsubscribeFromPush();
}

export function shouldPromptForNotifications() {
  return notificationsAvailable() && Notification.permission === 'default' && !load(PROMPT_DISMISSED_KEY);
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('Service worker registration failed:', err);
    return null;
  }
}

const REREGISTER_MS = 7 * 24 * 60 * 60 * 1000;

function logDevToken(token) {
  console.info('FCM registration token:', token);
  fetch('/__dev/fcm-token', { method: 'POST', body: JSON.stringify({ token }) }).catch(() => {});
}

export async function subscribeToPush() {
  if (!notificationsEnabled()) return null;
  const fcm = await getFirebaseMessaging();
  if (!fcm) return null;

  const serviceWorkerRegistration = await navigator.serviceWorker.ready;
  const token = await fcm.getToken(fcm.messaging, { serviceWorkerRegistration });
  if (import.meta.hot && import.meta.env.MODE !== 'test') logDevToken(token);
  const registered = load(REGISTERED_TOKEN_KEY);
  if (registered?.token !== token || Date.now() - registered.at > REREGISTER_MS) {
    await request.request('POST', 'v1/me/notifications/subscribe', { token }, true, true, true);
    save(REGISTERED_TOKEN_KEY, { token, at: Date.now() });
  }
  return token;
}

export async function unsubscribeFromPush() {
  save(REGISTERED_TOKEN_KEY, null);
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}
