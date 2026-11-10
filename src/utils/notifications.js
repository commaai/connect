export function notificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// 'default' (not asked yet), 'granted', 'denied', or 'unsupported'
export function getNotificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
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

// Must be called from a user gesture (e.g. a click handler), browsers ignore it otherwise.
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}
