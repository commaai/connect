import * as Sentry from '@sentry/browser';
import MyCommaAuth, { config as AuthConfig, storage as AuthStorage } from '@commaai/my-comma-auth';

import { athena as Athena, auth as Auth, billing as Billing, request as Request } from './api';

export { AuthConfig };

/** Provider codes the API expects, matching the /v2/auth/{code}/redirect/ URIs. */
export const PROVIDER_GOOGLE = 'g';
export const PROVIDER_APPLE = 'a';
export const PROVIDER_GITHUB = 'h';

const REDIRECT_KEY = 'redirectURL';

function onApiError(response) {
  if (response.status === 401) {
    MyCommaAuth.logOut();
  }
}

/** True when this URL is the oauth callback carrying a code to exchange. */
export function isAuthCallback(url) {
  return url.pathname.replace(/\/+$/, '') === AuthConfig.AUTH_PATH.replace(/\/+$/, '')
    && url.searchParams.has('code');
}

/**
 * Exchange an oauth code for an access token and persist it.
 *
 * @returns {Promise<string|null>} the token, or null if the exchange failed
 */
export async function exchangeCode(code, provider) {
  try {
    const token = await Auth.refreshAccessToken(code, provider);
    if (token) {
      AuthStorage.setCommaAccessToken(token);
      return token;
    }
  } catch (err) {
    console.error(err);
    Sentry.captureException(err, { fingerprint: 'app_auth_refresh_token' });
  }
  return null;
}

let initPromise = null;

/**
 * Read the stored token and point the API clients at it.
 *
 * Memoised: the root layout load runs on every navigation, but this only needs
 * to happen once per page load.
 *
 * @returns {Promise<string|null>}
 */
export function initAuth() {
  if (!initPromise) {
    initPromise = (async () => {
      const token = await MyCommaAuth.init();
      if (token) {
        Request.configure(token, onApiError);
        Billing.configure(token, onApiError);
        Athena.configure(token, onApiError);
      }
      return token ?? null;
    })();
  }
  return initPromise;
}

/** Forget the memoised session — used after logging out. */
export function resetAuth() {
  initPromise = null;
}

export function isAuthenticated() {
  return MyCommaAuth.isAuthenticated();
}

export function logOut() {
  resetAuth();
  return MyCommaAuth.logOut();
}

/**
 * Remember where to send the user once they finish signing in.
 *
 * `?r=` wins if present — that's what the api redirect appends when it bounces
 * an unauthenticated request back to the login page.
 */
export function rememberRedirect(url) {
  if (typeof sessionStorage === 'undefined') return;

  const requested = url.searchParams.get('r');
  if (requested) {
    sessionStorage.setItem(REDIRECT_KEY, requested);
  } else if (sessionStorage.getItem(REDIRECT_KEY) === null) {
    sessionStorage.setItem(REDIRECT_KEY, url.pathname);
  }
}

/** Consume the remembered destination, defaulting to the dashboard. */
export function takeRedirectUrl() {
  if (typeof sessionStorage === 'undefined') return '/';

  const stored = sessionStorage.getItem(REDIRECT_KEY);
  sessionStorage.removeItem(REDIRECT_KEY);

  // Never bounce back to the callback itself.
  if (!stored || stored.startsWith(AuthConfig.AUTH_PATH)) return '/';
  return stored;
}
