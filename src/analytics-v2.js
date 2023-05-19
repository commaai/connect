import { onCLS, onFID, onLCP } from 'web-vitals';

import { getCommaAccessToken } from '@commaai/my-comma-auth/storage';

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
  queue.add({
    _id: uniqueId(),
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
