import { onCLS, onFID, onLCP } from 'web-vitals';

import { getCommaAccessToken } from '@commaai/my-comma-auth/storage';

async function reportEvent(event) {
  const accessToken = await getCommaAccessToken();
  await fetch(`${window.COMMA_URL_ROOT}_/ping`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `JWT ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
}

async function sendToAnalytics(metric) {
  await reportEvent({
    event: 'web_vitals',
    ...metric,
  });
}

onCLS(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);
