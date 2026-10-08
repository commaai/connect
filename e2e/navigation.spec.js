import { test, expect, LOG, DONGLE } from './demo';

async function dashboard(page) {
  await expect(page.getByText('Missing start/end GPS', { exact: true })).toBeVisible();
}

async function drive(page) {
  await expect(page.getByText('Files', { exact: true })).toBeVisible();
}

test('demo dashboard loads without signing in', async ({ page }) => {
  await page.goto('/demo');
  await dashboard(page);
  await page.screenshot({ path: 'test-results/demo-dashboard.png' });
});

test('cold drive links survive refresh and copying into a new tab', async ({ page, context }) => {
  await page.goto(`/demo/${LOG}?source=e2e#keep`);
  await drive(page);
  const url = page.url();
  await page.reload();
  await drive(page);
  expect(page.url()).toBe(url);
  const copy = await context.newPage();
  await copy.goto(url);
  await drive(copy);
  expect(copy.url()).toBe(url);
  await page.screenshot({ path: 'test-results/demo-drive.png' });
});

test('dashboard and drive round-trip through browser history', async ({ page }) => {
  await page.goto('/demo?source=e2e#keep');
  await dashboard(page);
  await page.getByText('Missing start/end GPS', { exact: true }).click();
  await drive(page);
  const selected = page.url();
  await page.goBack();
  await dashboard(page);
  await page.goForward();
  await drive(page);
  expect(page.url()).toBe(selected);
});

test('cold files modal and zero-start range retain their URL', async ({ page }) => {
  await page.goto(`/demo/${LOG}/0/1?modal=files&source=e2e#keep`);
  await drive(page);
  await expect(page.getByRole('menu').first()).toBeVisible();
  const url = page.url();
  await page.reload();
  await drive(page);
  await expect(page.getByRole('menu').first()).toBeVisible();
  expect(page.url()).toBe(url);
});

test('owner-only settings are not shown for the demo shared device', async ({ page }) => {
  await page.goto(`/${DONGLE}?modal=settings&device=${DONGLE}`);
  await dashboard(page);
  await expect(page.getByRole('textbox', { name: /name/i })).toHaveCount(0);
});

for (const [path, text] of [
  ['/demo?modal=filter', 'Start date:'],
  ['/demo?modal=pair', 'Sign in to pair a device.'],
  [`/demo/${LOG}?modal=info`, `${DONGLE}/${LOG}/0`],
]) {
  test(`cold modal ${path} survives refresh and new tab`, async ({ page, context }) => {
    await page.goto(`${path}&source=e2e#keep`);
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    const copy = await context.newPage();
    await copy.goto(url);
    await expect(copy.getByText(text, { exact: true }).first()).toBeVisible();
    expect(copy.url()).toBe(url);
    await page.screenshot({ path: `test-results/modal-${new URL(url).searchParams.get('modal')}.png` });
  });
}

async function sharedGate(page) {
  // Settings also has a component-level check; verify the shared selector independently.
  const selected = await page.evaluate(async (dongleId) => {
    const { visibleModal } = await import('/src/url/modals.js');
    return visibleModal({
      router: { location: { pathname: location.pathname, search: location.search, hash: location.hash } },
      device: { dongle_id: dongleId, is_owner: false },
      devices: [{ dongle_id: dongleId, is_owner: false }], profile: { superuser: false },
    }).modal;
  }, DONGLE);
  expect(selected, 'Owner-only selector must hide the modal').toBeNull();
  // Check after hydration and keep checking through a short stable window.
  for (let check = 0; check < 4; check += 1) {
    await expect(page.locator('[role="dialog"], [role="menu"], [aria-labelledby="device-settings-modal"], [aria-labelledby="upload-queue-modal"]')).toHaveCount(0);
    await expect(page.getByText('Device settings', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Unpair device', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close video', exact: true })).toHaveCount(0);
    await page.waitForTimeout(100);
  }
}

for (const modal of ['settings', 'settings-uploads', 'unpair']) {
  test(`shared demo blocks ${modal} after refresh`, async ({ page }) => {
    await page.goto(`/demo?modal=${modal}&device=${DONGLE}`);
    await dashboard(page);
    await sharedGate(page);
    await page.reload();
    await dashboard(page);
    await sharedGate(page);
  });
}

for (const modal of ['uploads', 'clips', 'clip', 'delete-clip']) {
  test(`shared demo blocks drive modal ${modal}`, async ({ page }) => {
    const target = ['clip', 'delete-clip'].includes(modal) ? '&clip=test.mp4' : '';
    await page.goto(`/demo/${LOG}?modal=${modal}${target}`);
    await drive(page);
    await sharedGate(page);
    await page.reload();
    await drive(page);
    await sharedGate(page);
  });
}

test('cold drive Close replaces its history entry', async ({ page }) => {
  await page.goto('/demo?source=e2e#keep');
  await dashboard(page);
  await page.goto(`/demo/${LOG}?source=e2e#keep`);
  await drive(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await dashboard(page);
  expect(new URL(page.url()).pathname).toBe('/demo');
  await page.goBack();
  await dashboard(page);
  await page.goForward();
  await dashboard(page);
});

test('dashboard, filter, drive, files, info and referrals follow history', async ({ page }) => {
  await page.goto('/demo');
  await dashboard(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByText('Start date:', { exact: true })).toBeVisible();
  await page.goBack();
  await dashboard(page);
  await page.getByText('Missing start/end GPS', { exact: true }).click();
  await drive(page);
  await page.getByText('Files', { exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.goBack();
  await drive(page);
  await page.getByText('More info', { exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.goBack();
  await drive(page);
  await page.getByRole('button', { name: 'referrals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Referrals', exact: true })).toBeVisible();
  await page.goBack();
  await drive(page);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Your Referrals', exact: true })).toBeVisible();
});

for (const path of ['/demo/no-route', `/demo/${LOG}/0/0`, '/demo?modal=unknown']) {
  test(`invalid demo link ${path} recovers to dashboard`, async ({ page }) => {
    await page.goto(path);
    await dashboard(page);
    expect(new URL(page.url()).pathname).toBe('/demo');
    expect(new URL(page.url()).searchParams.has('modal')).toBe(false);
  });
}

test('second referral gift click returns to the demo dashboard', async ({ page }) => {
  await page.goto('/demo?source=e2e#keep');
  await dashboard(page);
  await page.getByRole('button', { name: 'referrals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Referrals', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'referrals', exact: true }).click();
  await dashboard(page);
  expect(new URL(page.url()).pathname).toBe('/demo');
  expect(new URL(page.url()).search).toBe('?source=e2e');
  expect(new URL(page.url()).hash).toBe('#keep');
});
