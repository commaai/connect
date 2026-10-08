export const REDIRECT_URL_KEY = 'redirectURL';

export function sanitizeRedirectUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }
  if (trimmed === '/' || trimmed === '/auth' || trimmed === '/auth/' || trimmed.startsWith('/auth/')) {
    return null;
  }
  if (trimmed === 'undefined' || trimmed === 'null') {
    return null;
  }
  return trimmed;
}

export function saveRedirectUrl(url) {
  const sanitized = sanitizeRedirectUrl(url);
  if (!sanitized) return;
  try {
    window.sessionStorage?.setItem(REDIRECT_URL_KEY, sanitized);
  } catch { /* storage unavailable */ }
  try {
    window.localStorage?.setItem(REDIRECT_URL_KEY, sanitized);
  } catch { /* storage unavailable */ }
}

export function consumeRedirectUrl() {
  let target = null;
  try {
    target = window.sessionStorage?.getItem(REDIRECT_URL_KEY) || null;
    window.sessionStorage?.removeItem(REDIRECT_URL_KEY);
  } catch { /* storage unavailable */ }
  try {
    if (!target) {
      target = window.localStorage?.getItem(REDIRECT_URL_KEY) || null;
    }
    window.localStorage?.removeItem(REDIRECT_URL_KEY);
  } catch { /* storage unavailable */ }
  return sanitizeRedirectUrl(target);
}
