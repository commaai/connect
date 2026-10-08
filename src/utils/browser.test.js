import { isIos, isMobileDevice } from './browser';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36';

test.each([
  ['iphone', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }, true, true],
  ['ipados', { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 }, true, true],
  ['mac', { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }, false, false],
  ['android', { userAgent: PIXEL, platform: 'Linux armv8l', maxTouchPoints: 5 }, false, true],
])('detects %s', (_name, navigatorLike, ios, mobile) => {
  expect(isIos(navigatorLike)).toBe(ios);
  expect(isMobileDevice(navigatorLike)).toBe(mobile);
});
