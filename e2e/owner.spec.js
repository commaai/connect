import { test, expect, LOG } from './demo';

const DEVICE = 'aaaaaaaaaaaaaaaa';
test.use({ owner: true });

for (const [path, text] of [
  [`/${DEVICE}?modal=settings`, 'Device settings'],
  [`/${DEVICE}?modal=settings-uploads`, 'Upload queue'],
  [`/${DEVICE}?modal=unpair`, 'Unpair device'],
  [`/${DEVICE}/${LOG}?modal=uploads`, 'Upload queue'],
  [`/${DEVICE}/${LOG}?modal=clips`, 'Create a clip'],
  [`/${DEVICE}/${LOG}?modal=clip&clip=absent.mp4`, 'Clip is unavailable.'],
  [`/${DEVICE}/${LOG}?modal=delete-clip&clip=absent.mp4`, 'Delete clip?'],
  [`/${DEVICE}/prime?modal=switch-prime`, 'Switch to Lite plan'],
  [`/${DEVICE}/prime?modal=cancel-prime`, 'Cancel prime subscription'],
]) {
  test(`owner cold URL ${path} survives refresh and new tab`, async ({ page, context }) => {
    await page.goto(`${path}&source=e2e#keep`);
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    const url = page.url();
    await page.reload();
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    const copy = await context.newPage();
    await copy.goto(url);
    await expect(copy.getByText(text, { exact: true }).first()).toBeVisible();
    expect(copy.url()).toBe(url);
    await page.screenshot({ path: `test-results/owner-${new URL(url).searchParams.get('modal')}.png` });
  });
}
