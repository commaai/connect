const ATTRIBUTES = {
  app: 'connect',
  gitCommit: import.meta.env.VITE_APP_GIT_SHA || 'dev',
  environment: import.meta.env.MODE || 'unknown',
  ci: new URLSearchParams(window.location.search).get('ci') || false,
};
const RESERVED_KEYS = new Set(['_id', ...Object.keys(ATTRIBUTES)]);

// Backend analytics endpoint is disabled; keep the API so callers don't break.
// TODO: reimplement this properly (on the backend)
export function sendEvent(event) {
  if (!event.event) {
    throw new Error('Analytics event must have an event property');
  }
  const collisions = Object.keys(event).filter((key) => RESERVED_KEYS.has(key));
  if (collisions.length > 0) {
    throw new Error(`Analytics event cannot have reserved keys ${collisions.join(', ')}`);
  }
}
