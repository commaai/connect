import { isIos } from './browser';

test('recognizes mobile and desktop-mode iOS user agents', () => {
  expect(isIos({ userAgent: 'iPhone' })).toBe(true);
  expect(isIos({ userAgent: 'Macintosh', maxTouchPoints: 5 })).toBe(true);
  expect(isIos({ userAgent: 'Macintosh', maxTouchPoints: 0 })).toBe(false);
  expect(isIos({ userAgent: 'Android', maxTouchPoints: 5 })).toBe(false);
});
