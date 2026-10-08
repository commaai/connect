export function isIos(navigatorLike = navigator) {
  const userAgent = navigatorLike.userAgent || '';
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  // iPadOS Safari in desktop mode reports a Macintosh UA; touch points give it away.
  return /Macintosh/i.test(userAgent) && navigatorLike.maxTouchPoints > 1;
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().includes('firefox');
}

export function isMobileDevice(navigatorLike = navigator) {
  if (navigatorLike.userAgentData?.mobile === true) return true;

  const userAgent = navigatorLike.userAgent || '';
  const isIpadOs = /Macintosh/i.test(userAgent) && navigatorLike.maxTouchPoints > 1;

  return isIpadOs
    || /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Opera Mini|Kindle|Silk|PlayBook/i
      .test(userAgent);
}
