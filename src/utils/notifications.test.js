import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebase', () => ({ getFirebaseMessaging: vi.fn() }));

import { getFirebaseMessaging } from './firebase';
import {
  disableNotifications,
  dismissNotificationsPrompt,
  getPlatform,
  shouldPromptForNotifications,
  subscribeToPush,
  unsubscribeFromPush,
} from './notifications';

describe('getPlatform', () => {
  it('detects iPhone, iPadOS and Android', () => {
    expect(getPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe('ios');
    expect(getPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe('ios');
    expect(getPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe('android');
    expect(getPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe('other');
  });
});

describe('shouldPromptForNotifications', () => {
  const setup = ({ standalone = true, permission = 'default' } = {}) => {
    vi.stubGlobal('matchMedia', () => ({ matches: standalone }));
    vi.stubGlobal('Notification', { permission });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('prompts in the installed PWA when permission has not been asked', () => {
    setup();
    expect(shouldPromptForNotifications()).toBe(true);
  });

  it('does not prompt in a browser tab', () => {
    setup({ standalone: false });
    expect(shouldPromptForNotifications()).toBe(false);
  });

  it('does not prompt once permission is granted or denied', () => {
    setup({ permission: 'granted' });
    expect(shouldPromptForNotifications()).toBe(false);
    setup({ permission: 'denied' });
    expect(shouldPromptForNotifications()).toBe(false);
  });

  it('does not prompt after "Not now"', () => {
    setup();
    dismissNotificationsPrompt();
    expect(shouldPromptForNotifications()).toBe(false);
  });
});

describe('push subscription', () => {
  const TOKEN = 'cXyZ123:APA91b-token';

  let fetchMock;
  let fcm;
  let registration;
  let subscription;

  const setup = ({ permission = 'granted', supported = true, token = TOKEN } = {}) => {
    vi.stubGlobal('Notification', { permission });
    vi.stubGlobal('PushManager', function PushManager() {});
    subscription = { unsubscribe: vi.fn(async () => true) };
    registration = { pushManager: { getSubscription: vi.fn(async () => subscription) } };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve(registration), getRegistration: async () => registration },
      configurable: true,
    });
    fcm = { messaging: {}, getToken: vi.fn(async () => token) };
    getFirebaseMessaging.mockResolvedValue(supported ? fcm : null);
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: 1 }) }));
    vi.stubGlobal('fetch', fetchMock);
  };

  const calls = () => fetchMock.mock.calls.map(([url, opts]) => [opts.method, url.replace(/^.*\/v1/, 'v1'), JSON.parse(opts.body)]);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('gets an FCM token with our service worker and registers it with the backend', async () => {
    setup();
    expect(await subscribeToPush()).toBe(TOKEN);
    expect(fcm.getToken).toHaveBeenCalledWith(fcm.messaging, { serviceWorkerRegistration: registration });
    expect(calls()).toEqual([['POST', 'v1/me/notifications/subscribe', { token: TOKEN }]]);
  });

  it('only tells the backend about new tokens, and again after a week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setup();
    await subscribeToPush();
    await subscribeToPush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fcm.getToken.mockResolvedValue('new:token');
    await subscribeToPush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await subscribeToPush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('registers again if the backend call failed', async () => {
    setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'error' });
    await expect(subscribeToPush()).rejects.toThrow('502: error');
    await subscribeToPush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing without permission or FCM support', async () => {
    setup({ permission: 'default' });
    await subscribeToPush();
    setup({ supported: false });
    expect(await subscribeToPush()).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turning off unsubscribes the browser and forgets the token', async () => {
    setup();
    await subscribeToPush();
    await disableNotifications();
    expect(subscription.unsubscribe).toHaveBeenCalled();

    window.localStorage.removeItem('notificationsDisabled');
    await subscribeToPush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('unsubscribing without a subscription is fine', async () => {
    setup();
    registration.pushManager.getSubscription.mockResolvedValue(null);
    await unsubscribeFromPush();
  });
});
