// Where to go after sign-in. A page that needs it links to signInUrl(); the sign-in page keeps the
// target in sessionStorage across the OAuth round trip; /auth/ takes it back. Only same-site paths count.
const KEY = 'redirectURL';
const storage = () => { try { return window.sessionStorage; } catch { return undefined; } };
const queryTarget = () => new URLSearchParams(window.location.search).get('r');

function sameSite(raw) {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : null;
  } catch { return null; }
}

// encodeURI keeps the slashes readable: /?r=/<dongle>/<log>
export const signInUrl = (path) => `/?r=${encodeURI(path)}`;

// the ?r= target of the current URL (a signed-in user who followed a sign-in link)
export const linkedReturnPath = () => (queryTarget() === null ? null : sameSite(queryTarget()));

export function rememberReturnPath() {
  const { pathname, search } = window.location;
  try { storage()?.setItem(KEY, queryTarget() ?? storage()?.getItem(KEY) ?? pathname + search); } catch { /* blocked */ }
}

export function takeReturnPath() {
  let raw = null;
  try {
    raw = storage()?.getItem(KEY) ?? null;
    storage()?.removeItem(KEY);
  } catch { /* blocked */ }
  return raw === null ? null : sameSite(raw);
}
