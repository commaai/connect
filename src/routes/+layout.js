import * as Sentry from '@sentry/browser';

import { account as Account, devices as Devices } from '$lib/api';
import { exchangeCode, initAuth, isAuthCallback } from '$lib/auth';

// connect authenticates with a JWT in localStorage and is served as static
// files, so there is no server to render against and nothing to prerender
// behind the auth gate. adapter-static's SPA fallback does the rest.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'ignore';

async function loadSession() {
  const [profile, devices] = await Promise.all([
    Account.getProfile().catch((err) => {
      Sentry.captureException(err, { fingerprint: 'layout_fetch_profile' });
      return null;
    }),
    Devices.listDevices().catch((err) => {
      Sentry.captureException(err, { fingerprint: 'layout_list_devices' });
      return null;
    }),
  ]);
  return { profile, devices };
}

/** Runs in the browser only, because ssr is disabled above. */
export async function load({ url }) {
  const mockScenario = import.meta.env.VITE_MOCK_API === 'true'
    ? import.meta.env.VITE_MOCK_SCENARIO
    : null;

  if (mockScenario) {
    // Match the dev mock backend: seed a session so every screen is reachable
    // with no device, except in the scenario that exercises the signed-out UI.
    // This load re-runs on every navigation, so only seed when there is no
    // session — otherwise it would clobber a token from a real code exchange.
    if (mockScenario === 'anonymous') localStorage.removeItem('authorization');
    else if (!localStorage.getItem('authorization')) localStorage.setItem('authorization', 'mock-token');
  }

  // The code has to be exchanged before the session is read, or the freshly
  // returned token is not in storage yet.
  if (isAuthCallback(url)) {
    await exchangeCode(url.searchParams.get('code'), url.searchParams.get('provider'));
  }

  const token = await initAuth();
  const authenticated = Boolean(token);
  const { profile, devices } = authenticated ? await loadSession() : { profile: null, devices: null };

  return { authenticated, profile, devices, mockScenario };
}
