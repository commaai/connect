import { onCLS, onFID, onLCP } from 'web-vitals';

import { getCommaAccessToken } from '@commaai/my-comma-auth/storage';

const ATTRIBUTES = {
  app: 'connect',
  gitCommit: process.env.REACT_APP_GIT_SHA || 'dev',
  environment: process.env.NODE_ENV || 'development',
  ci: new URLSearchParams(window.location.search).get('ci') || false,
};
const RESERVED_KEYS = new Set(['_id', ...Object.keys(ATTRIBUTES)]);

const queue = new Set();
let counter = 0;

function uniqueId() {
  counter += 1;
  return `${Date.now()}-${Math.random().toString(10).substring(2, 10)}-${counter}`;
}

async function flushQueue() {
  if (queue.size === 0) return;

  // TODO: flush queue when auth state changes
  const accessToken = await getCommaAccessToken();

  const body = JSON.stringify([...queue]);

  await fetch(`${window.COMMA_URL_ROOT}_/ping`, {
    body,
    headers: {
      Authorization: `JWT ${accessToken}`,
      'Content-Type': 'application/json',
    },
    keepalive: true,
    method: 'POST',
  });

  queue.clear();
}

export function sendEvent(event) {
  if (!event.event) {
    throw new Error('Analytics event must have an event property');
  }
  const collisions = Object.keys(event).filter((key) => RESERVED_KEYS.has(key));
  if (collisions.length > 0) {
    throw new Error(`Analytics event cannot have reserved keys ${collisions.join(', ')}`);
  }
  queue.add({
    _id: uniqueId(),
    ...ATTRIBUTES,
    ...event,
  });
}

function sendToAnalytics(metric) {
  sendEvent({
    event: 'web_vitals',
    ...metric,
  });
}

onCLS(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);

// Report all available metrics whenever the page is backgrounded or unloaded.
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushQueue();
  }
});

// NOTE: Safari does not reliably fire the `visibilitychange` event when the
// page is being unloaded. If Safari support is needed, you should also flush the
// queue in the `pagehide` event.
window.addEventListener('pagehide', flushQueue);
